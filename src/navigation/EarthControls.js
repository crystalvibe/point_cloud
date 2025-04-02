import * as THREE from "../../libs/three.js/build/three.module.js";
import {MOUSE} from "../defines.js";
import {Utils} from "../utils.js";
import {EventDispatcher} from "../EventDispatcher.js";

export class EarthControls extends EventDispatcher {
	constructor (viewer) {
		super(viewer);

		this.viewer = viewer;
		this.renderer = viewer.renderer;

		this.scene = null;
		this.sceneControls = new THREE.Scene();

		this.rotationSpeed = 10;

		this.fadeFactor = 20;
		this.wheelDelta = 0;
		this.zoomDelta = new THREE.Vector3();
		this.camStart = null;

		// Add movement deltas
		this.yawDelta = 0;
		this.pitchDelta = 0;
		this.panDelta = new THREE.Vector2(0, 0);
		this.radiusDelta = 0;

		this.tweens = [];

		{
			let sg = new THREE.SphereGeometry(1, 16, 16);
			let sm = new THREE.MeshNormalMaterial();
			this.pivotIndicator = new THREE.Mesh(sg, sm);
			this.pivotIndicator.visible = false;
			this.sceneControls.add(this.pivotIndicator);
		}

		let drag = (e) => {
			if (e.drag.object !== null) {
				return;
			}

			if (e.drag.startHandled === undefined) {
				e.drag.startHandled = true;
				this.dispatchEvent({type: 'start'});
			}

			let camera = this.scene.getActiveCamera();
			let view = this.viewer.scene.view;

			let ndrag = {
				x: e.drag.lastDrag.x / this.renderer.domElement.clientWidth,
				y: e.drag.lastDrag.y / this.renderer.domElement.clientHeight
			};

			if (e.drag.mouse === MOUSE.LEFT) {
				// Rotate
				this.yawDelta += ndrag.x * this.rotationSpeed;
				this.pitchDelta += ndrag.y * this.rotationSpeed;

				// Limit pitch to avoid going under/over the poles
				let pitch = view.pitch - this.pitchDelta;
				if(pitch > Math.PI / 2){
					this.pitchDelta = view.pitch - Math.PI / 2;
				}else if(pitch < -Math.PI / 2){
					this.pitchDelta = view.pitch + Math.PI / 2;
				}
			} else if (e.drag.mouse === MOUSE.RIGHT) {
				// Pan
				let panSpeed = view.radius * 2;
				this.panDelta.x += ndrag.x * panSpeed;
				this.panDelta.y += ndrag.y * panSpeed;
			}
		};

		let onMouseWheel = e => {
			let delta = -e.delta * 0.1;
			let view = this.viewer.scene.view;

			// Adjust zoom speed based on distance
			let zoomSpeed = view.radius * 0.2;
			this.radiusDelta += delta * zoomSpeed;

			// Clamp radius
			let newRadius = view.radius + this.radiusDelta;
			let minRadius = 0.1;
			let maxRadius = 100000;
			newRadius = Math.max(minRadius, Math.min(maxRadius, newRadius));
			
			this.radiusDelta = newRadius - view.radius;
		};

		let drop = e => {
			this.dispatchEvent({type: 'end'});
		};

		let onMouseUp = e => {
			this.camStart = null;
		};

		this.addEventListener('drag', drag);
		this.addEventListener('drop', drop);
		this.addEventListener('mousewheel', onMouseWheel);
		this.addEventListener('mouseup', onMouseUp);
	}

	setScene (scene) {
		this.scene = scene;

		// Get model bounds
		let box = this.viewer.getBoundingBox(scene.pointclouds);
		let size = box.getSize(new THREE.Vector3());
		let maxDim = Math.max(size.x, size.y, size.z);
		let center = box.getCenter(new THREE.Vector3());
		
		// Set up orthographic camera
		let camera = scene.getActiveCamera();
		if (camera instanceof THREE.OrthographicCamera) {
			let aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;
			camera.left = -maxDim * aspect;
			camera.right = maxDim * aspect;
			camera.top = maxDim;
			camera.bottom = -maxDim;
			camera.near = -1000;
			camera.far = 1000;
			camera.updateProjectionMatrix();
			
			// Position camera for top view
			scene.view.position.set(
				center.x,
				center.y,
				center.z + maxDim * 2
			);
			scene.view.radius = maxDim * 2;
			scene.view.pitch = -Math.PI / 2;  // Look straight down
			scene.view.yaw = 0;
		}

		// Enable controls
		this.enabled = true;

		// Reset all deltas
		this.wheelDelta = 0;
		this.zoomDelta.set(0, 0, 0);
		this.yawDelta = 0;
		this.pitchDelta = 0;
		this.panDelta.set(0, 0);
		this.radiusDelta = 0;

		// Set initial move speed
		this.viewer.setMoveSpeed(maxDim);
	}

	update (delta) {
		let view = this.scene.view;
		let camera = this.scene.getActiveCamera();

		if (!this.enabled || this.scene.scenePointCloud.children.length === 0) {
			return;
		}

		let moveSpeed = this.viewer.getMoveSpeed();

		// Handle orthographic zoom
		if (camera instanceof THREE.OrthographicCamera) {
			let progression = Math.min(1, this.fadeFactor * delta);
			
			// Apply zoom
			if (this.radiusDelta !== 0) {
				let factor = 1 + this.radiusDelta * progression;
				camera.left *= factor;
				camera.right *= factor;
				camera.top *= factor;
				camera.bottom *= factor;
				camera.updateProjectionMatrix();
				
				this.radiusDelta *= (1 - progression);
			}
			
			// Apply pan
			if (!this.panDelta.equals(new THREE.Vector2(0, 0))) {
				let aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;
				let panScale = (camera.right - camera.left) / this.renderer.domElement.clientWidth;
				
				view.position.x += this.panDelta.x * progression * panScale;
				view.position.y += this.panDelta.y * progression * panScale;
				
				this.panDelta.multiplyScalar(1 - progression);
			}
			
			// Apply rotation (yaw only for orthographic)
			if (this.yawDelta !== 0) {
				view.yaw -= progression * this.yawDelta;
				this.yawDelta *= (1 - progression);
			}
		}

		if (this.pivotIndicator.visible) {
			let distance = this.pivotIndicator.position.distanceTo(view.position);
			let pixelwidth = this.renderer.domElement.clientwidth;
			let pixelHeight = this.renderer.domElement.clientHeight;
			let pr = Utils.projectedRadius(1, this.scene.getActiveCamera(), distance, pixelwidth, pixelHeight);
			let scale = (10 / pr);
			this.pivotIndicator.scale.set(scale, scale, scale);
		}
	}
};
