/**
 * @author mschuetz / http://mschuetz.at
 *
 * adapted from THREE.OrbitControls by
 *
 * @author qiao / https://github.com/qiao
 * @author mrdoob / http://mrdoob.com
 * @author alteredq / http://alteredqualia.com/
 * @author WestLangley / http://github.com/WestLangley
 * @author erich666 / http://erichaines.com
 *
 *
 *
 */

import * as THREE from "../../libs/three.js/build/three.module.js";
import {MOUSE} from "../defines.js";
import {Utils} from "../utils.js";
import {EventDispatcher} from "../EventDispatcher.js";

export class OrbitControls extends EventDispatcher{
	
	constructor(viewer){
		super();
		
		this.viewer = viewer;
		this.renderer = viewer.renderer;
		this.scene = viewer.scene;
		this.controls = viewer.controls;

		// Force enabled state
		this.enabled = true;

		// Initialize state
		this.STATE = {
			NONE: -1,
			ROTATE: 0,
			DOLLY: 1,
			PAN: 2
		};
		
		this.state = this.STATE.NONE;
		this.rotateSpeed = 1.0;
		this.panSpeed = 1.0;

		// Remove all rotation limits
		this.minPolarAngle = -Infinity;
		this.maxPolarAngle = Infinity;
		this.minAzimuthAngle = -Infinity;
		this.maxAzimuthAngle = Infinity;

		this.keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };
		this.mouse = {
			LEFT: THREE.MOUSE.LEFT,
			MIDDLE: THREE.MOUSE.MIDDLE,
			RIGHT: THREE.MOUSE.RIGHT
		};

		this.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN,
			THREE: THREE.TOUCH.DOLLY_ROTATE
		};

		this.events = {};

		this.isLoading = false;

		this.rotateStart = new THREE.Vector2();
		this.rotateEnd = new THREE.Vector2();
		this.rotateDelta = new THREE.Vector2();

		this.panStart = new THREE.Vector2();
		this.panEnd = new THREE.Vector2();
		this.panDelta = new THREE.Vector2();

		this.dollyStart = new THREE.Vector2();
		this.dollyEnd = new THREE.Vector2();
		this.dollyDelta = new THREE.Vector2();

		this.phiDelta = 0;
		this.thetaDelta = 0;
		this.scale = 1.0;
		this.panOffset = new THREE.Vector3();

		this.updateLastPosition = new THREE.Vector3();
		this.updateLastQuaternion = new THREE.Quaternion();
		this.updateLastOffset = new THREE.Vector3();

		this.zoomChanged = false;

		// Track whether event listeners are already attached
		this.eventListenersAttached = false;

		// Bind methods
		this.rotateLeft = this.rotateLeft.bind(this);
		this.rotateUp = this.rotateUp.bind(this);
		this.pan = this.pan.bind(this);
		this.dollyIn = this.dollyIn.bind(this);
		this.dollyOut = this.dollyOut.bind(this);
		this.update = this.update.bind(this);
		this.onStart = this.onStart.bind(this);
		this.onEnd = this.onEnd.bind(this);
		this.onMove = this.onMove.bind(this);
		this.onKeyDown = this.onKeyDown.bind(this);
		this.onKeyUp = this.onKeyUp.bind(this);
		this.onMouseDown = this.onMouseDown.bind(this);
		this.onMouseMove = this.onMouseMove.bind(this);
		this.onMouseUp = this.onMouseUp.bind(this);
		this.onMouseLeave = this.onMouseLeave.bind(this);
		this.onTouchStart = this.onTouchStart.bind(this);
		this.onTouchMove = this.onTouchMove.bind(this);
		this.onTouchEnd = this.onTouchEnd.bind(this);
		this.onWheel = this.onWheel.bind(this);
		this.onContextMenu = this.onContextMenu.bind(this);

		// Initialize event listeners immediately, but defer actual binding
		this._initializeEventBindings();

		this.isInitialized = false;
		this.controlsState = {
			enabled: true,
			rotateSpeed: 1.0,
			panSpeed: 1.0,
			zoomSpeed: 1.0,
			minDistance: 0,
			maxDistance: Infinity,
			minPolarAngle: 0,
			maxPolarAngle: Math.PI,
			minAzimuthAngle: -Infinity,  // Allow full 360-degree rotation
			maxAzimuthAngle: Infinity,   // Allow full 360-degree rotation
			enableDamping: true,
			dampingFactor: 0.05,
			enableZoom: true,
			zoomDampingFactor: 0.05,
			enableRotate: true,
			rotateDampingFactor: 0.05,
			enablePan: true,
			panDampingFactor: 0.05,
			target: new THREE.Vector3(),
			position: new THREE.Vector3(),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(1, 1, 1),
			spherical: new THREE.Spherical(),
			sphericalDelta: new THREE.Spherical(),
			panOffset: new THREE.Vector3(),
			rotateStart: new THREE.Vector2(),
			rotateEnd: new THREE.Vector2(),
			rotateDelta: new THREE.Vector2(),
			panStart: new THREE.Vector2(),
			panEnd: new THREE.Vector2(),
			panDelta: new THREE.Vector2(),
			dollyStart: new THREE.Vector2(),
			dollyEnd: new THREE.Vector2(),
			dollyDelta: new THREE.Vector2(),
			state: this.STATE.NONE
		};

		// Force initialization
		this.initializeControls();
	}

	_initializeEventBindings() {
		// Set up a mutation observer to detect when the renderer domElement is attached
		if (typeof MutationObserver !== 'undefined') {
			// Use a self-executing function to handle the initialization
			(function(self) {
				// The function to attempt adding event listeners
				const tryEnableControls = function() {
					if (self.renderer && self.renderer.domElement) {
						self.initializeControls();
						return true;
					}
					return false;
				};
				
				// Try immediately
				if (tryEnableControls()) return;
				
				// If it fails, set up a periodic check
				const interval = setInterval(function() {
					if (tryEnableControls()) {
						clearInterval(interval);
					}
				}, 50);
				
				// Also set up a one-time timeout for a final attempt
				setTimeout(function() {
					clearInterval(interval);
					tryEnableControls();
				}, 2000);
			})(this);
		} else {
			// Simple fallback for browsers without MutationObserver
			setTimeout(() => this.initializeControls(), 100);
		}
	}

	initializeControls() {
		if (this.isInitialized) return;

		// Force disable other controls
		if (this.viewer.earthControls) {
			this.viewer.earthControls.enabled = false;
			this.viewer.earthControls.disable();
		}
		if (this.viewer.fpControls) {
			this.viewer.fpControls.enabled = false;
		}
		if (this.viewer.deviceControls) {
			this.viewer.deviceControls.enabled = false;
		}
		if (this.viewer.vrControls) {
			this.viewer.vrControls.enabled = false;
		}

		// Set up event listeners
		this.setupEventListeners();

		// Initialize camera position
		this.initializeCameraPosition();

		this.isInitialized = true;
	}

	setupEventListeners() {
		const domElement = this.renderer.domElement;

		// Mouse events
		domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
		domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
		domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
		domElement.addEventListener('mouseleave', this.onMouseLeave.bind(this));
		domElement.addEventListener('wheel', this.onWheel.bind(this));

		// Touch events
		domElement.addEventListener('touchstart', this.onTouchStart.bind(this));
		domElement.addEventListener('touchmove', this.onTouchMove.bind(this));
		domElement.addEventListener('touchend', this.onTouchEnd.bind(this));

		// Prevent context menu
		domElement.addEventListener('contextmenu', (e) => e.preventDefault());
	}

	initializeCameraPosition() {
		const scene = this.viewer.scene;
		if (!scene) return;

		const box = scene.getBoundingBox();
		const size = box.getSize(new THREE.Vector3());
		const center = box.getCenter(new THREE.Vector3());
		const maxDim = Math.max(size.x, size.y, size.z);

		// Set initial camera position
		const position = new THREE.Vector3(
			center.x,
			center.y - maxDim,
			center.z + maxDim
		);

		// Update view
		scene.view.position.copy(position);
		scene.view.lookAt(center);
		scene.view.radius = maxDim * 2;
		scene.view.pitch = -Math.PI / 4;
		scene.view.yaw = 0;

		// Set move speed
		this.viewer.setMoveSpeed(maxDim);
	}

	update(delta) {
		if (!this.enabled || !this.scene || !this.scene.view) return;

		const view = this.scene.view;

		if (this.state === this.STATE.ROTATE) {
			// Apply rotation without any restrictions
			view.yaw += this.rotateDelta.x;
			view.pitch += this.rotateDelta.y;

			// Reset deltas
			this.rotateDelta.set(0, 0);
		}

		if (this.state === this.STATE.PAN) {
			const panSpeed = this.panSpeed * view.radius;
			view.position.x += this.panDelta.x * panSpeed;
			view.position.y += this.panDelta.y * panSpeed;
			
			// Reset pan delta
			this.panDelta.set(0, 0);
		}
	}

	onMouseDown(event) {
		if (!this.enabled) return;

		event.preventDefault();

		switch (event.button) {
			case this.mouse.LEFT:
				this.state = this.STATE.ROTATE;
				this.rotateStart.set(event.clientX, event.clientY);
				break;
			case this.mouse.RIGHT:
				this.state = this.STATE.PAN;
				this.panStart.set(event.clientX, event.clientY);
				break;
		}
	}

	onMouseMove(event) {
		if (!this.enabled || this.state === this.STATE.NONE) return;

		event.preventDefault();

		switch (this.state) {
			case this.STATE.ROTATE:
				this.rotateEnd.set(event.clientX, event.clientY);
				this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart)
					.multiplyScalar(0.002 * this.rotateSpeed);
				this.rotateStart.copy(this.rotateEnd);
				break;

			case this.STATE.PAN:
				this.panEnd.set(event.clientX, event.clientY);
				this.panDelta.subVectors(this.panEnd, this.panStart)
					.multiplyScalar(0.002 * this.panSpeed);
				this.panStart.copy(this.panEnd);
				break;
		}
	}

	onMouseUp() {
		this.state = this.STATE.NONE;
	}

	onWheel(event) {
		if (!this.enabled) return;

		event.preventDefault();

		let delta = 0;
		if (event.wheelDelta !== undefined) {
			delta = event.wheelDelta;
		} else if (event.detail !== undefined) {
			delta = -event.detail;
		}

		if (delta > 0) {
			this.dollyOut();
		} else if (delta < 0) {
			this.dollyIn();
		}
	}

	onTouchStart(event) {
		if (!this.enabled) return;

		event.preventDefault();

		switch (event.touches.length) {
			case 1:
				this.state = this.STATE.ROTATE;
				this.rotateStart.set(event.touches[0].pageX, event.touches[0].pageY);
				break;
			case 2:
				this.state = this.STATE.DOLLY;
				const dx = event.touches[0].pageX - event.touches[1].pageX;
				const dy = event.touches[0].pageY - event.touches[1].pageY;
				this.dollyStart.set(Math.sqrt(dx * dx + dy * dy));
				break;
			case 3:
				this.state = this.STATE.PAN;
				this.panStart.set(event.touches[0].pageX, event.touches[0].pageY);
				break;
		}

		this.dispatchEvent({type: 'start'});
	}

	onTouchMove(event) {
		if (!this.enabled) return;

		event.preventDefault();

		switch (this.state) {
			case this.STATE.ROTATE:
				this.rotateEnd.set(event.touches[0].pageX, event.touches[0].pageY);
				this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart);
				this.rotateStart.copy(this.rotateEnd);

				// Apply rotation without any restrictions
				this.rotateDelta.x -= 2 * Math.PI * this.rotateDelta.x / this.renderer.domElement.clientWidth * this.rotateSpeed;
				this.rotateDelta.y -= 2 * Math.PI * this.rotateDelta.y / this.renderer.domElement.clientHeight * this.rotateSpeed;
				break;
			case this.STATE.DOLLY:
				this.dollyEnd.set(event.touches[0].pageX, event.touches[0].pageY);
				this.dollyDelta.subVectors(this.dollyEnd, this.dollyStart);
				this.dollyStart.copy(this.dollyEnd);

				this.radiusDelta += this.dollyDelta.y * this.zoomSpeed;
				break;
			case this.STATE.PAN:
				this.panEnd.set(event.touches[0].pageX, event.touches[0].pageY);
				this.panDelta.subVectors(this.panEnd, this.panStart);
				this.panStart.copy(this.panEnd);

				this.panDelta.multiplyScalar(this.panSpeed);
				break;
		}

		this.dispatchEvent({type: 'move'});
	}

	onTouchEnd(event) {
		if (!this.enabled) return;

		event.preventDefault();

		this.state = this.STATE.NONE;

		this.dispatchEvent({type: 'end'});
	}

	onMouseLeave(event) {
		if (!this.enabled) return;

		event.preventDefault();

		this.state = this.STATE.NONE;

		this.dispatchEvent({type: 'end'});
	}

	onContextMenu(event) {
		event.preventDefault();
	}

	onKeyDown(event) {
		if (!this.enabled) return;

		switch (event.keyCode) {
			case this.keys.LEFT:
				this.rotateDelta.x += 2 * Math.PI * 0.1;
				break;
			case this.keys.UP:
				this.rotateDelta.y += 2 * Math.PI * 0.1;
				break;
			case this.keys.RIGHT:
				this.rotateDelta.x -= 2 * Math.PI * 0.1;
				break;
			case this.keys.BOTTOM:
				this.rotateDelta.y -= 2 * Math.PI * 0.1;
				break;
		}

		this.dispatchEvent({type: 'move'});
	}

	onKeyUp(event) {
		if (!this.enabled) return;

		switch (event.keyCode) {
			case this.keys.LEFT:
			case this.keys.UP:
			case this.keys.RIGHT:
			case this.keys.BOTTOM:
				break;
		}
	}

	clampRadius() {
		if (!this.scene || !this.scene.view) {
			console.log('ClampRadius - No scene or view');
			return;
		}

		let newRadius = this.scene.view.radius + this.radiusDelta;
		console.log('ClampRadius:', {
			currentRadius: this.scene.view.radius,
			radiusDelta: this.radiusDelta,
			newRadius: newRadius,
			minRadius: this.minRadius,
			maxRadius: this.maxRadius
		});

		if (newRadius < this.minRadius) {
			console.log('Clamping to minRadius');
			this.radiusDelta = this.minRadius - this.scene.view.radius;
		} else if (newRadius > this.maxRadius) {
			console.log('Clamping to maxRadius');
			this.radiusDelta = this.maxRadius - this.scene.view.radius;
		}
	}

	setScene(scene) {
		this.scene = scene;
		
		try {
		// Get model bounds
			const box = this.viewer.getBoundingBox(scene.pointclouds);
			const center = box.getCenter(new THREE.Vector3());
			const size = box.getSize(new THREE.Vector3());
			const maxDim = Math.max(size.x, size.y, size.z);
		
		// Set radius limits based on model size
			this.minRadius = maxDim * 0.1;  // Allow closer zoom
			this.maxRadius = maxDim * 20;  // Allow distant view
			
			// Initialize camera position for better orbit view around center
			const camera = scene.getActiveCamera();
			camera.position.set(center.x, center.y - maxDim, center.z + maxDim);
			camera.lookAt(center);
		
		// Initialize view position and orientation
			scene.view.position.copy(camera.position);
			scene.view.lookAt(center);
		scene.view.radius = maxDim * 2;  // Set initial zoom level
		scene.view.pitch = -Math.PI / 4;  // 45 degree angle
		scene.view.yaw = 0;

			// Set target to center of point cloud
			this.target.copy(center);
			
			// Set initial move speed based on point cloud size
			this.viewer.setMoveSpeed(maxDim);

		// Reset all deltas
		this.resetControls();

			// Force event listeners to be attached
			if (!this.eventListenersAttached) {
				this.initializeControls();
			}
			
			// Enable controls
			this.enabled = true;
		} catch (e) {
			console.error('Error in OrbitControls.setScene:', e);
		}
	}

	resetControls() {
		// Reset all deltas
		this.rotateDelta.set(0, 0);
		this.radiusDelta = 0;
	}

	enable() {
		this.enabled = true;
	}

	disable() {
		this.enabled = false;
		this.resetControls();
	}
	
	stop() {
		this.resetControls();
	}

	zoomToLocation(mouse) {
		if (!this.scene || !this.viewer) return;
		
		let camera = this.scene.getActiveCamera();
		
		let intersection = Utils.getMousePointCloudIntersection(
			mouse,
			camera,
			this.viewer,
			this.scene.pointclouds,
			{pickClipped: true});

		if (!intersection) return;

		// Determine target radius
		let targetRadius = 0;
		{
			const minimumJumpDistance = 0.2;

			const domElement = this.renderer.domElement;
			const ray = Utils.mouseToRay(mouse, camera, domElement.clientWidth, domElement.clientHeight);

			const nodes = intersection.pointcloud.nodesOnRay(intersection.pointcloud.visibleNodes, ray);
			if (nodes.length === 0) return;
			
			const lastNode = nodes[nodes.length - 1];
			const radius = lastNode.getBoundingSphere(new THREE.Sphere()).radius;
			targetRadius = Math.min(this.scene.view.radius, radius);
			targetRadius = Math.max(minimumJumpDistance, targetRadius);
		}

		// Calculate target position
		const direction = this.scene.view.direction.clone().multiplyScalar(-1);
		const targetPosition = new THREE.Vector3().addVectors(
			intersection.location, 
			direction.multiplyScalar(targetRadius)
		);

		// Animate to target
		this.animateTo(targetPosition, intersection.location, targetRadius);
	}

	animateTo(targetPosition, lookAtPosition, targetRadius) {
		if (!this.scene || !this.scene.view) return;
		
		const animationDuration = 600;
		const easing = TWEEN.Easing.Quartic.Out;

		const startPosition = this.scene.view.position.clone();
		const startRadius = this.scene.view.radius;

		// Create and start animation
		const animation = {progress: 0};
		const tween = new TWEEN.Tween(animation)
			.to({progress: 1}, animationDuration)
			.easing(easing);

		tween.onUpdate(() => {
			const t = animation.progress;
			
			// Interpolate position
			this.scene.view.position.x = (1 - t) * startPosition.x + t * targetPosition.x;
			this.scene.view.position.y = (1 - t) * startPosition.y + t * targetPosition.y;
			this.scene.view.position.z = (1 - t) * startPosition.z + t * targetPosition.z;
			
			// Interpolate radius
			this.scene.view.radius = (1 - t) * startRadius + t * targetRadius;
			
			// Update look at and move speed
			if (lookAtPosition) {
				this.scene.view.lookAt(lookAtPosition);
			}
			
			this.viewer.setMoveSpeed(this.scene.view.radius / 2.5);
		});

		tween.start();
	}

	get STATE() {
		return {
			NONE: -1,
			ROTATE: 0,
			DOLLY: 1,
			PAN: 2
		};
	}
};
