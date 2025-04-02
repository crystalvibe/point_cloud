console.warn("[CRITICAL-WORKER] Worker script loaded");

self.onerror = function(error) {
	console.error("[CRITICAL-WORKER] Global error:", error);
};

function readUsingTempArrays(event) {
	console.warn("[CRITICAL-WORKER] Starting point cloud processing");
	
	if (!event || !event.data) {
		console.error("[CRITICAL-WORKER] Invalid event received");
		return;
	}
	
	let buffer = event.data.buffer;
	let numPoints = event.data.numPoints;
	let sourcePointSize = event.data.pointSize;
	let pointFormatID = event.data.pointFormatID;
	let scale = event.data.scale;
	let offset = event.data.offset;

	console.warn("[CRITICAL-WORKER] Received data:", {
		hasBuffer: !!buffer,
		bufferSize: buffer ? buffer.byteLength : 0,
		numPoints,
		sourcePointSize,
		pointFormatID
	});

	if (!buffer || !buffer.byteLength) {
		console.error("[CRITICAL-WORKER] Invalid or empty buffer received");
		return;
	}

	// Create a small test buffer to verify data access
	let testBuffer = buffer.slice(0, Math.min(1000, buffer.byteLength));
	let testView = new Uint8Array(testBuffer);
	console.warn("[CRITICAL-WORKER] First 10 bytes of data:", Array.from(testView.slice(0, 10)));

	console.log("[DEBUG-WORKER] Input validation:", {
		bufferSize: buffer.byteLength,
		numPoints,
		sourcePointSize,
		pointFormatID,
		scale,
		offset,
		expectedSize: numPoints * sourcePointSize
	});

	if (buffer.byteLength < numPoints * sourcePointSize) {
		console.error("[DEBUG-WORKER] ERROR: Buffer size mismatch!", {
			bufferSize: buffer.byteLength,
			expectedSize: numPoints * sourcePointSize
		});
		return;
	}

	let temp = new ArrayBuffer(4);
	let tempUint8 = new Uint8Array(temp);
	let tempUint16 = new Uint16Array(temp);
	let tempInt32 = new Int32Array(temp);
	let sourceUint8 = new Uint8Array(buffer);

	// Debug first few bytes of the buffer
	console.log("[DEBUG-WORKER] First 32 bytes of buffer:", Array.from(sourceUint8.slice(0, 32)));

	let tightBoundingBox = {
		min: [ Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY ],
		max: [ Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY ]
	};

	let mean = [0, 0, 0];

	try {
		let pBuff = new ArrayBuffer(numPoints * 3 * 4);
		let cBuff = new ArrayBuffer(numPoints * 4);
		let iBuff = new ArrayBuffer(numPoints * 4);
		let clBuff = new ArrayBuffer(numPoints);
		let rnBuff = new ArrayBuffer(numPoints);
		let nrBuff = new ArrayBuffer(numPoints);
		let psBuff = new ArrayBuffer(numPoints * 2);

		let positions = new Float32Array(pBuff);
		let colors = new Uint8Array(cBuff);
		let intensities = new Float32Array(iBuff);
		let classifications = new Uint8Array(clBuff);
		let returnNumbers = new Uint8Array(rnBuff);
		let numberOfReturns = new Uint8Array(nrBuff);
		let pointSourceIDs = new Uint16Array(psBuff);

		console.log("[DEBUG-WORKER] Starting point processing");

		let validPoints = 0;
		let invalidPoints = 0;

		for (let i = 0; i < numPoints; i++) {
			if (i % 1000000 === 0) {
				console.log(`[DEBUG-WORKER] Processing point ${i}/${numPoints}`);
			}

			try {
				// POSITION
				tempUint8[0] = sourceUint8[i * sourcePointSize + 0];
				tempUint8[1] = sourceUint8[i * sourcePointSize + 1];
				tempUint8[2] = sourceUint8[i * sourcePointSize + 2];
				tempUint8[3] = sourceUint8[i * sourcePointSize + 3];
				let x = tempInt32[0];

				tempUint8[0] = sourceUint8[i * sourcePointSize + 4];
				tempUint8[1] = sourceUint8[i * sourcePointSize + 5];
				tempUint8[2] = sourceUint8[i * sourcePointSize + 6];
				tempUint8[3] = sourceUint8[i * sourcePointSize + 7];
				let y = tempInt32[0];

				tempUint8[0] = sourceUint8[i * sourcePointSize + 8];
				tempUint8[1] = sourceUint8[i * sourcePointSize + 9];
				tempUint8[2] = sourceUint8[i * sourcePointSize + 10];
				tempUint8[3] = sourceUint8[i * sourcePointSize + 11];
				let z = tempInt32[0];

				x = x * scale[0] + offset[0];
				y = y * scale[1] + offset[1];
				z = z * scale[2] + offset[2];

				if (isNaN(x) || isNaN(y) || isNaN(z)) {
					console.error(`[DEBUG-WORKER] Invalid position at point ${i}:`, {x, y, z});
					invalidPoints++;
					continue;
				}

				positions[3 * i + 0] = x;
				positions[3 * i + 1] = y;
				positions[3 * i + 2] = z;

				mean[0] += x / numPoints;
				mean[1] += y / numPoints;
				mean[2] += z / numPoints;

				tightBoundingBox.min[0] = Math.min(tightBoundingBox.min[0], x);
				tightBoundingBox.min[1] = Math.min(tightBoundingBox.min[1], y);
				tightBoundingBox.min[2] = Math.min(tightBoundingBox.min[2], z);

				tightBoundingBox.max[0] = Math.max(tightBoundingBox.max[0], x);
				tightBoundingBox.max[1] = Math.max(tightBoundingBox.max[1], y);
				tightBoundingBox.max[2] = Math.max(tightBoundingBox.max[2], z);

				// INTENSITY
				tempUint8[0] = sourceUint8[i * sourcePointSize + 12];
				tempUint8[1] = sourceUint8[i * sourcePointSize + 13];
				let intensity = tempUint16[0];
				intensities[i] = intensity;

				// CLASSIFICATION
				let classification = sourceUint8[i * sourcePointSize + 15];
				classifications[i] = classification;

				validPoints++;
			} catch (error) {
				console.error(`[DEBUG-WORKER] Error processing point ${i}:`, error);
				invalidPoints++;
			}
		}

		console.log("[DEBUG-WORKER] Point processing complete:", {
			validPoints,
			invalidPoints,
			boundingBox: {
				min: tightBoundingBox.min,
				max: tightBoundingBox.max
			},
			mean
		});

		let message = {
			mean: mean,
			position: pBuff,
			color: cBuff,
			intensity: iBuff,
			classification: clBuff,
			returnNumber: rnBuff,
			numberOfReturns: nrBuff,
			pointSourceID: psBuff,
			tightBoundingBox: tightBoundingBox,
			indices: indices
		};

		console.log("[DEBUG-WORKER] Preparing to transfer buffers");

		let transferables = [
			message.position,
			message.color,
			message.intensity,
			message.classification,
			message.returnNumber,
			message.numberOfReturns,
			message.pointSourceID,
			message.indices
		];

		console.warn("[CRITICAL-WORKER] Processing complete, sending data back");
		postMessage(message, transferables);
		console.warn("[CRITICAL-WORKER] Data sent successfully");

	} catch (error) {
		console.error("[CRITICAL-WORKER] Fatal error during processing:", error);
	}
}

function readUsingDataView(event) {

	performance.mark("laslaz-start");

	let buffer = event.data.buffer;
	let numPoints = event.data.numPoints;
	let sourcePointSize = event.data.pointSize;
	let pointFormatID = event.data.pointFormatID;
	let scale = event.data.scale;
	let offset = event.data.offset;

	let sourceView = new DataView(buffer);

	let tightBoundingBox = {
		min: [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
		max: [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE]
	};

	let mean = [0, 0, 0];

	let pBuff = new ArrayBuffer(numPoints * 3 * 4);
	let cBuff = new ArrayBuffer(numPoints * 4);
	let iBuff = new ArrayBuffer(numPoints * 4);
	let clBuff = new ArrayBuffer(numPoints);
	let rnBuff = new ArrayBuffer(numPoints);
	let nrBuff = new ArrayBuffer(numPoints);
	let psBuff = new ArrayBuffer(numPoints * 2);

	let positions = new Float32Array(pBuff);
	let colors = new Uint8Array(cBuff);
	let intensities = new Float32Array(iBuff);
	let classifications = new Uint8Array(clBuff);
	let returnNumbers = new Uint8Array(rnBuff);
	let numberOfReturns = new Uint8Array(nrBuff);
	let pointSourceIDs = new Uint16Array(psBuff);
	
	const rangeIntensity = [Infinity, -Infinity];
	const rangeClassification = [Infinity, -Infinity];
	const rangeReturnNumber = [Infinity, -Infinity];
	const rangeNumberOfReturns = [Infinity, -Infinity];
	const rangeSourceID = [Infinity, -Infinity];

	for (let i = 0; i < numPoints; i++) {
		// POSITION
		let ux = sourceView.getInt32(i * sourcePointSize + 0, true);
		let uy = sourceView.getInt32(i * sourcePointSize + 4, true);
		let uz = sourceView.getInt32(i * sourcePointSize + 8, true);

		x = ux * scale[0] + offset[0] - event.data.mins[0];
		y = uy * scale[1] + offset[1] - event.data.mins[1];
		z = uz * scale[2] + offset[2] - event.data.mins[2];

		positions[3 * i + 0] = x;
		positions[3 * i + 1] = y;
		positions[3 * i + 2] = z;

		mean[0] += x / numPoints;
		mean[1] += y / numPoints;
		mean[2] += z / numPoints;

		tightBoundingBox.min[0] = Math.min(tightBoundingBox.min[0], x);
		tightBoundingBox.min[1] = Math.min(tightBoundingBox.min[1], y);
		tightBoundingBox.min[2] = Math.min(tightBoundingBox.min[2], z);

		tightBoundingBox.max[0] = Math.max(tightBoundingBox.max[0], x);
		tightBoundingBox.max[1] = Math.max(tightBoundingBox.max[1], y);
		tightBoundingBox.max[2] = Math.max(tightBoundingBox.max[2], z);

		// INTENSITY
		let intensity = sourceView.getUint16(i * sourcePointSize + 12, true);
		intensities[i] = intensity;
		rangeIntensity[0] = Math.min(rangeIntensity[0], intensity);
		rangeIntensity[1] = Math.max(rangeIntensity[1], intensity);

		// RETURN NUMBER, stored in the first 3 bits - 00000111
		// number of returns stored in next 3 bits   - 00111000
		let returnNumberAndNumberOfReturns = sourceView.getUint8(i * sourcePointSize + 14, true);
		let returnNumber = returnNumberAndNumberOfReturns & 0b0111;
		let numberOfReturn = (returnNumberAndNumberOfReturns & 0b00111000) >> 3;
		returnNumbers[i] = returnNumber;
		numberOfReturns[i] = numberOfReturn;
		rangeReturnNumber[0] = Math.min(rangeReturnNumber[0], returnNumber);
		rangeReturnNumber[1] = Math.max(rangeReturnNumber[1], returnNumber);
		rangeNumberOfReturns[0] = Math.min(rangeNumberOfReturns[0], numberOfReturn);
		rangeNumberOfReturns[1] = Math.max(rangeNumberOfReturns[1], numberOfReturn);

		// CLASSIFICATION
		let classification = sourceView.getUint8(i * sourcePointSize + 15, true);
		classifications[i] = classification;
		rangeClassification[0] = Math.min(rangeClassification[0], classification);
		rangeClassification[1] = Math.max(rangeClassification[1], classification);

		// POINT SOURCE ID
		let pointSourceID = sourceView.getUint16(i * sourcePointSize + 18, true);
		pointSourceIDs[i] = pointSourceID;
		rangeSourceID[0] = Math.min(rangeSourceID[0], pointSourceID);
		rangeSourceID[1] = Math.max(rangeSourceID[1], pointSourceID);

		// COLOR, if available
		if (pointFormatID === 2 || pointFormatID === 3 || pointFormatID === 5) {
			let colorOffset = pointFormatID === 2 ? 20 : 28;  // Format 2 has different color offset than 3 and 5
			tempUint8[0] = sourceView.getUint8(i * sourcePointSize + colorOffset);
			tempUint8[1] = sourceView.getUint8(i * sourcePointSize + colorOffset + 1);
			let r = tempUint16[0];

			tempUint8[0] = sourceView.getUint8(i * sourcePointSize + colorOffset + 2);
			tempUint8[1] = sourceView.getUint8(i * sourcePointSize + colorOffset + 3);
			let g = tempUint16[0];

			tempUint8[0] = sourceView.getUint8(i * sourcePointSize + colorOffset + 4);
			tempUint8[1] = sourceView.getUint8(i * sourcePointSize + colorOffset + 5);
			let b = tempUint16[0];

			r = r / 256;
			g = g / 256;
			b = b / 256;
			colors[4 * i + 0] = r;
			colors[4 * i + 1] = g;
			colors[4 * i + 2] = b;
		}

		// GPS Time, if available (formats 4 and 5)
		if (pointFormatID === 4 || pointFormatID === 5) {
			let gpsTime = new Float64Array(sourceView.buffer, i * sourcePointSize + 20, 1)[0];
			// Store GPS time if needed - you may want to add a new buffer for this
		}
	}

	let indices = new ArrayBuffer(numPoints * 4);
	let iIndices = new Uint32Array(indices);
	for (let i = 0; i < numPoints; i++) {
		iIndices[i] = i;
	}

	performance.mark("laslaz-end");

	//{ // print timings
	//	performance.measure("laslaz", "laslaz-start", "laslaz-end");
	//	let measure = performance.getEntriesByType("measure")[0];
	//	let dpp = 1000 * measure.duration / numPoints;
	//	let debugMessage = `${measure.duration.toFixed(3)} ms, ${numPoints} points, ${dpp.toFixed(3)} µs / point`;
	//	console.log(debugMessage);
	//}
	performance.clearMarks();
	performance.clearMeasures();

	const ranges = {
		"intensity": rangeIntensity,
		"classification": rangeClassification,
		"return number": rangeReturnNumber,
		"number of returns": rangeNumberOfReturns,
		"source id": rangeSourceID,
	};

	let message = {
		mean: mean,
		position: pBuff,
		color: cBuff,
		intensity: iBuff,
		classification: clBuff,
		returnNumber: rnBuff,
		numberOfReturns: nrBuff,
		pointSourceID: psBuff,
		tightBoundingBox: tightBoundingBox,
		indices: indices,
		ranges: ranges,
	};

	let transferables = [
		message.position,
		message.color,
		message.intensity,
		message.classification,
		message.returnNumber,
		message.numberOfReturns,
		message.pointSourceID,
		message.indices];

	postMessage(message, transferables);
};

onmessage = readUsingTempArrays;
console.warn("[CRITICAL-WORKER] Worker initialized and ready");
