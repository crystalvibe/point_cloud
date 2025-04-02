import * as THREE from "../../libs/three.js/build/three.module.js";
import {Version} from "../Version.js";
import {XHRFactory} from "../XHRFactory.js";

// Add path initialization
if (typeof Potree !== "undefined") {
	if (!Potree.scriptPath) {
		console.warn("Potree.scriptPath not set, trying to auto-detect...");
		let scriptPath = document.currentScript.src;
		scriptPath = scriptPath.substring(0, scriptPath.lastIndexOf("/"));
		Potree.scriptPath = scriptPath + "/";
		console.log("Auto-detected Potree.scriptPath:", Potree.scriptPath);
	}
}

/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *  https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 *
 */

export class LasLazLoader {

	constructor (version, extension) {
		if (typeof (version) === 'string') {
			this.version = new Version(version);
		} else {
			this.version = version;
		}

		this.extension = extension;
		console.log("LasLazLoader initialized with version:", this.version, "extension:", this.extension);
	}

	static progressCB (progress) {
		console.log("Loading progress:", Math.round(progress * 100) + "%");
	}

	load (node) {
		if (node.loaded) {
			return;
		}

		let url = node.getURL();

		if (this.version.equalOrHigher('1.4')) {
			url += `.${this.extension}`;
		}

		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = 'arraybuffer';
		xhr.overrideMimeType('text/plain; charset=x-user-defined');
		xhr.onreadystatechange = () => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200 || xhr.status === 0) {
					let buffer = xhr.response;
					this.parse(node, buffer);
				} else {
					console.log('Failed to load file! HTTP status: ' + xhr.status + ', file: ' + url);
				}
			}
		};

		xhr.send(null);
	}

	async parse(node, buffer){
		console.log("[DEBUG] Starting LAS/LAZ parsing process");
		let lf = new LASFile(buffer);
		let handler = new LasLazBatcher(node);

		try{
			console.log("[DEBUG] Attempting to open LAS file");
			await lf.open();
			lf.isOpen = true;
			console.log("[DEBUG] Successfully opened LAS file");
		}catch(e){
			console.error("[DEBUG] Failed to open LAS file:", e);
			return;
		}

		let header = await lf.getHeader();
		console.log("[DEBUG] LAS Header:", {
			pointsCount: header.pointsCount,
			pointsFormatId: header.pointsFormatId,
			pointsStructSize: header.pointsStructSize,
			scale: header.scale,
			offset: header.offset,
			mins: header.mins,
			maxs: header.maxs
		});

		let skip = 1;
		let totalRead = 0;
		let totalToRead = (skip <= 1 ? header.pointsCount : header.pointsCount / skip);
		console.log("[DEBUG] Starting point reading process. Total points to read:", totalToRead);

		let hasMoreData = true;
		let chunkCounter = 0;

		while(hasMoreData){
			chunkCounter++;
			console.log(`[DEBUG] Reading chunk #${chunkCounter}`);
			let data = await lf.readData(1000 * 1000, 0, skip);
			console.log("[DEBUG] Chunk data:", {
				chunkNumber: chunkCounter,
				pointsRead: data.count,
				hasMoreData: data.hasMoreData,
				formatId: header.pointsFormatId,
				structSize: header.pointsStructSize
			});

			handler.push(new LASDecoder(data.buffer,
				header.pointsFormatId,
				header.pointsStructSize,
				data.count,
				header.scale,
				header.offset,
				header.mins, header.maxs));

			totalRead += data.count;
			let progress = totalRead / totalToRead;
			console.log(`[DEBUG] Loading progress: ${(progress * 100).toFixed(2)}%`);
			LasLazLoader.progressCB(progress);

			hasMoreData = data.hasMoreData;
		}

		header.totalRead = totalRead;
		header.versionAsString = lf.versionAsString;
		header.isCompressed = lf.isCompressed;

		LasLazLoader.progressCB(1);
		console.log("[DEBUG] Finished loading points:", {
			totalRead: totalRead,
			version: lf.versionAsString,
			isCompressed: lf.isCompressed
		});

		try{
			console.log("[DEBUG] Attempting to close LAS file");
			await lf.close();
			lf.isOpen = false;
			console.log("[DEBUG] Successfully closed LAS file");
		}catch(e){
			console.error("[DEBUG] Failed to close LAS file:", e);
			throw e;
		}
	}

	handle (node, url) {

	}
};

export class LasLazBatcher{

	constructor (node) {
		console.log("[DEBUG] Initializing LasLazBatcher for node:", node.name);
		this.node = node;
	}

	push (lasBuffer) {
		// Immediate console log to verify function is called
		console.warn("[CRITICAL] Starting LAS processing");
		
		// Check if lasBuffer is valid
		if (!lasBuffer || !lasBuffer.arrayb) {
			console.error("[CRITICAL] Invalid LAS buffer received:", lasBuffer);
			return;
		}

		// Verify Potree script path
		if (!Potree || !Potree.scriptPath) {
			console.error("[CRITICAL] Potree.scriptPath is not set!");
			Potree.scriptPath = document.currentScript ? document.currentScript.src.substring(0, document.currentScript.src.lastIndexOf("/")) : "";
			console.warn("[CRITICAL] Attempting to set Potree.scriptPath to:", Potree.scriptPath);
		}

		const workerPath = Potree.scriptPath + '/workers/LASDecoderWorker.js';
		console.warn("[CRITICAL] Worker path:", workerPath);
		
		// Verify worker file exists
		fetch(workerPath)
			.then(response => {
				if (!response.ok) {
					throw new Error(`Worker file not found at ${workerPath}`);
				}
				console.warn("[CRITICAL] Worker file exists");
			})
			.catch(error => {
				console.error("[CRITICAL] Error accessing worker file:", error);
			});

		// Check if worker pool is initialized
		if (!Potree.workerPool) {
			console.error("[CRITICAL] Potree.workerPool is not initialized!");
			// Try to initialize worker pool
			if (typeof Potree.WorkerPool !== "undefined") {
				console.warn("[CRITICAL] Attempting to initialize worker pool");
				Potree.workerPool = new Potree.WorkerPool();
			}
			return;
		}

		let worker = Potree.workerPool.getWorker(workerPath);
		if (!worker) {
			console.error("[CRITICAL] Failed to get worker from pool!");
			return;
		}

		console.warn("[CRITICAL] Successfully created worker");

		worker.onmessage = (e) => {
			console.warn("[CRITICAL] Received message from worker");
			if (!e.data) {
				console.error("[DEBUG] ERROR: Worker returned no data!");
				return;
			}

			console.log("[DEBUG] Worker processing complete:", {
				numPoints: e.data.numPoints,
				position: e.data.position ? e.data.position.byteLength : 0,
				color: e.data.color ? e.data.color.byteLength : 0,
				intensity: e.data.intensity ? e.data.intensity.byteLength : 0,
				classification: e.data.classification ? e.data.classification.byteLength : 0
			});

			let geometry = new THREE.BufferGeometry();
			
			console.log("[DEBUG] Creating buffer attributes");
			
			let numPoints = e.data.numPoints;
			if (!numPoints) {
				console.error("[DEBUG] ERROR: No points received from worker!");
				return;
			}

			try {
				let positions = new Float32Array(e.data.position);
				let colors = new Uint8Array(e.data.color);
				let intensities = new Float32Array(e.data.intensity);
				let classifications = new Uint8Array(e.data.classification);
				let indices = new Uint8Array(e.data.indices);

				console.log("[DEBUG] Buffer sizes:", {
					positions: positions.length,
					colors: colors.length,
					intensities: intensities.length,
					classifications: classifications.length,
					indices: indices.length
				});

				// Check if positions are valid
				let hasValidPositions = positions.some(v => v !== 0 && !isNaN(v));
				if (!hasValidPositions) {
					console.error("[DEBUG] ERROR: All positions are zero or invalid!");
				}

				geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
				geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4, true));
				geometry.setAttribute('intensity', new THREE.BufferAttribute(intensities, 1));
				geometry.setAttribute('classification', new THREE.BufferAttribute(classifications, 1));
				geometry.setAttribute('indices', new THREE.BufferAttribute(indices, 4));
				
				console.log("[DEBUG] Computing geometry bounds");
				geometry.computeBoundingBox();
				geometry.computeBoundingSphere();

				if (!geometry.boundingBox || !geometry.boundingSphere) {
					console.error("[DEBUG] ERROR: Failed to compute geometry bounds!");
					return;
				}

				this.node.geometry = geometry;
				this.node.numPoints = numPoints;
				this.node.loaded = true;
				this.node.loading = false;
				this.node.mean = new THREE.Vector3(...e.data.mean);
				
				console.log("[DEBUG] Node geometry complete:", {
					boundingBox: this.node.boundingBox ? this.node.boundingBox.toArray() : null,
					boundingSphere: geometry.boundingSphere ? geometry.boundingSphere.radius : null,
					mean: this.node.mean.toArray(),
					numPoints: numPoints
				});

				// Check if viewer exists and is properly initialized
				if (this.node.pcoGeometry.root === this.node) {
					console.log("[DEBUG] Root node loaded - checking viewer");
					if (!this.node.pcoGeometry.viewer) {
						console.error("[DEBUG] ERROR: Viewer not initialized!");
						return;
					}

					this.node.pcoGeometry.viewer.updateMatrixWorld(true);
					
					const center = this.node.boundingBox.getCenter(new THREE.Vector3());
					const size = this.node.boundingBox.getSize(new THREE.Vector3());
					const maxDim = Math.max(size.x, size.y, size.z);
					
					console.log("[DEBUG] Camera setup:", {
						center: center.toArray(),
						size: size.toArray(),
						maxDim: maxDim,
						hasCamera: !!this.node.pcoGeometry.viewer.camera
					});
					
					if (this.node.pcoGeometry.viewer.camera) {
						this.node.pcoGeometry.viewer.camera.position.copy(center);
						this.node.pcoGeometry.viewer.camera.position.z += maxDim * 2;
						this.node.pcoGeometry.viewer.camera.lookAt(center);
						this.node.pcoGeometry.viewer.camera.updateProjectionMatrix();
						
						// Force a render
						if (this.node.pcoGeometry.viewer.renderer) {
							console.log("[DEBUG] Forcing renderer update");
							this.node.pcoGeometry.viewer.renderer.render(
								this.node.pcoGeometry.viewer.scene,
								this.node.pcoGeometry.viewer.camera
							);
						} else {
							console.error("[DEBUG] ERROR: No renderer found!");
						}
					} else {
						console.error("[DEBUG] ERROR: No camera found in viewer!");
					}
				}
			} catch (error) {
				console.error("[DEBUG] ERROR during geometry creation:", error);
			}

			Potree.workerPool.returnWorker(workerPath, worker);
		};

		worker.onerror = (error) => {
			console.error("[CRITICAL] Worker error:", error);
		};

		let message = {
			buffer: lasBuffer.arrayb,
			numPoints: lasBuffer.pointsCount,
			pointSize: lasBuffer.pointSize,
			pointFormatID: lasBuffer.pointsFormatId,
			scale: lasBuffer.scale,
			offset: lasBuffer.offset,
			mins: lasBuffer.mins,
			maxs: lasBuffer.maxs
		};

		console.warn("[CRITICAL] Sending data to worker:", {
			numPoints: message.numPoints,
			pointSize: message.pointSize,
			pointFormatID: message.pointFormatID,
			bufferSize: message.buffer ? message.buffer.byteLength : 0
		});

		try {
			worker.postMessage(message, [message.buffer]);
			console.warn("[CRITICAL] Successfully posted message to worker");
		} catch (error) {
			console.error("[CRITICAL] ERROR posting message to worker:", error);
		}
	}
}
