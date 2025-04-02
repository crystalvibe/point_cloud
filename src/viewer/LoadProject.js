import * as THREE from "../../libs/three.js/build/three.module.js";
import {Annotation} from "../Annotation.js";
import {Measure} from "../utils/Measure.js";
import {CameraAnimation} from "../modules/CameraAnimation/CameraAnimation.js";
import {Utils} from "../utils.js";
import {PointSizeType} from "../defines.js";

async function loadPointCloud(viewer, args = {}){
	let loadMaterial = args.loadMaterial;
	let material = args.material;

	try{
		let tStart = performance.now();

		let source = args.source;
		
		let pointcloud = await Potree.loadPointCloud(source, (xhr) => {
			if(args.callback){
				args.callback(xhr);
			}
		});

		pointcloud.name = args.name;

		if(args.rotation){
			pointcloud.rotation.set(...args.rotation);
		}

		if(args.scale){
			pointcloud.scale.set(...args.scale);
		}

		if(args.position){
			pointcloud.position.set(...args.position);
		}

		viewer.scene.addPointCloud(pointcloud);

		return pointcloud;
	}catch(e){
		console.error("loading pointcloud failed: " + e);
		return null;
	}
}

function loadMeasurement(viewer, data){

	const duplicate = viewer.scene.measurements.find(measure => measure.uuid === data.uuid);
	if(duplicate){
		return;
	}

	const measure = new Measure();

	measure.uuid = data.uuid;
	measure.name = data.name;
	measure.showDistances = data.showDistances;
	measure.showCoordinates = data.showCoordinates;
	measure.showArea = data.showArea;
	measure.closed = data.closed;
	measure.showAngles = data.showAngles;
	measure.showHeight = data.showHeight;
	measure.showCircle = data.showCircle;
	measure.showAzimuth = data.showAzimuth;
	measure.showEdges = data.showEdges;
	// color

	for(const point of data.points){
		const pos = new THREE.Vector3(...point);
		measure.addMarker(pos);
	}

	viewer.scene.addMeasurement(measure);

}

function loadVolume(viewer, data){

	const duplicate = viewer.scene.volumes.find(volume => volume.uuid === data.uuid);
	if(duplicate){
		return;
	}

	let volume = new Potree[data.type];

	volume.uuid = data.uuid;
	volume.name = data.name;
	volume.position.set(...data.position);
	volume.rotation.set(...data.rotation);
	volume.scale.set(...data.scale);
	volume.visible = data.visible;
	volume.clip = data.clip;

	viewer.scene.addVolume(volume);
}

function loadCameraAnimation(viewer, data){

	const duplicate = viewer.scene.cameraAnimations.find(a => a.uuid === data.uuid);
	if(duplicate){
		return;
	}

	const animation = new CameraAnimation(viewer);

	animation.uuid = data.uuid;
	animation.name = data.name;
	animation.duration = data.duration;
	animation.t = data.t;
	animation.curveType = data.curveType;
	animation.visible = data.visible;
	animation.controlPoints = [];

	for(const cpdata of data.controlPoints){
		const cp = animation.createControlPoint();

		cp.position.set(...cpdata.position);
		cp.target.set(...cpdata.target);
	}

	viewer.scene.addCameraAnimation(animation);
}

function loadOrientedImages(viewer, images){

	const {cameraParamsPath, imageParamsPath} = images;

	const duplicate = viewer.scene.orientedImages.find(i => i.imageParamsPath === imageParamsPath);
	if(duplicate){
		return;
	}

	Potree.OrientedImageLoader.load(cameraParamsPath, imageParamsPath, viewer).then( images => {
		viewer.scene.addOrientedImages(images);
	});

}

function loadGeopackage(viewer, geopackage){

	const path = geopackage.path;

	const duplicate = viewer.scene.geopackages.find(i => i.path === path);
	if(duplicate){
		return;
	}

	const projection = viewer.getProjection();

	proj4.defs("WGS84", "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs");
	proj4.defs("pointcloud", projection);
	const transform = proj4("WGS84", "pointcloud");
	const params = {
		transform: transform,
	};

	Potree.GeoPackageLoader.loadUrl(path, params).then(data => {
		viewer.scene.addGeopackage(data);
	});
	

}

function loadSettings(viewer, data){
	if(!data){
		return;
	}

	viewer.setPointBudget(data.pointBudget);
	viewer.setFOV(data.fov);
	viewer.setEDLEnabled(data.edlEnabled);
	viewer.setEDLRadius(data.edlRadius);
	viewer.setEDLStrength(data.edlStrength);
	viewer.setBackground(data.background);
	viewer.setMinNodeSize(data.minNodeSize);
	viewer.setShowBoundingBox(data.showBoundingBoxes);
}

function loadView(viewer, view){
	viewer.scene.view.position.set(...view.position);
	viewer.scene.view.lookAt(...view.target);
}

function loadAnnotationItem(item){

	const annotation = new Annotation({
		position: item.position,
		title: item.title,
		cameraPosition: item.cameraPosition,
		cameraTarget: item.cameraTarget,
	});


	annotation.description = item.description;
	annotation.uuid = item.uuid;

	if(item.offset){
		annotation.offset.set(...item.offset);
	}

	return annotation;
}

function loadAnnotations(viewer, data){

	if(!data){
		return;
	}

	const findDuplicate = (item) => {

		let duplicate = null;

		viewer.scene.annotations.traverse( a => {
			if(a.uuid === item.uuid){
				duplicate = a;
			}
		});

		return duplicate;
	};

	const traverse = (item, parent) => {

		const duplicate = findDuplicate(item);
		if(duplicate){
			return;
		}

		const annotation = loadAnnotationItem(item);

		for(const childItem of item.children){
			traverse(childItem, annotation);
		}

		parent.add(annotation);

	};

	for(const item of data){
		traverse(item, viewer.scene.annotations);
	}

}

function loadProfile(viewer, data){
	
	const {name, points} = data;

	const duplicate = viewer.scene.profiles.find(profile => profile.uuid === data.uuid);
	if(duplicate){
		return;
	}

	let profile = new Potree.Profile();
	profile.name = name;
	profile.uuid = data.uuid;

	profile.setWidth(data.width);

	for(const point of points){
		profile.addMarker(new THREE.Vector3(...point));
	}
	
	viewer.scene.addProfile(profile);
}

function loadClassification(viewer, data){
	if(!data){
		return;
	}

	const classifications = data;

	viewer.setClassifications(classifications);
}

export async function loadProject(viewer, data){

	if(data.type !== "Potree"){
		console.error("not a valid Potree project");
		return;
	}

	loadSettings(viewer, data.settings);

	loadView(viewer, data.view);

	const pointcloudPromises = [];
	for(const pointcloud of data.pointclouds){
		const promise = loadPointCloud(viewer, pointcloud);
		pointcloudPromises.push(promise);
	}

	for(const measure of data.measurements){
		loadMeasurement(viewer, measure);
	}

	for(const volume of data.volumes){
		loadVolume(viewer, volume);
	}

	for(const animation of data.cameraAnimations){
		loadCameraAnimation(viewer, animation);
	}

	for(const profile of data.profiles){
		loadProfile(viewer, profile);
	}

	if(data.orientedImages){
		for(const images of data.orientedImages){
			loadOrientedImages(viewer, images);
		}
	}

	loadAnnotations(viewer, data.annotations);

	loadClassification(viewer, data.classification);

	// need to load at least one point cloud that defines the scene projection,
	// before we can load stuff in other projections such as geopackages
	//await Promise.any(pointcloudPromises); // (not yet supported)
	Utils.waitAny(pointcloudPromises).then( () => {
		if(data.geopackages){
			for(const geopackage of data.geopackages){
				loadGeopackage(viewer, geopackage);
			}
		}
	});

	await Promise.all(pointcloudPromises);
}