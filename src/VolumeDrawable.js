import { getColorByChannelIndex } from './constants/colors.js';
import MeshVolume from './MeshVolume.js';
import RayMarchedAtlasVolume from './RayMarchedAtlasVolume.js';
import PathTracedVolume from './PathTracedVolume.js';

// A renderable multichannel volume image with 8-bits per channel intensity values.
export default class VolumeDrawable {

  constructor(volume, requestPathTrace) {
    this.PT = !!requestPathTrace;

    // THE VOLUME DATA
    this.volume = volume;

    this.onChannelDataReadyCallback = null;

    this.translation = new THREE.Vector3(0,0,0);
    this.rotation = new THREE.Euler();

    this.maskChannelIndex = -1;
    this.maskAlpha = 1.0;

    this.channel_colors = this.volume.channel_colors_default.slice();

    this.fusion = this.channel_colors.map((col, index) => {
      let rgbColor;
      // take copy of original channel color
      if (col[0] === 0 && col[1] === 0 && col[2] === 0) {
        rgbColor = 0;
      } else {
        rgbColor = [col[0], col[1], col[2]];
      }
      return {
        chIndex: index,
        lut:[],
        rgbColor: rgbColor
      };
    });

    this.specular = new Array(this.volume.num_channels).fill([0,0,0]);
    this.emissive = new Array(this.volume.num_channels).fill([0,0,0]);
    this.roughness = new Array(this.volume.num_channels).fill(0);

    this.sceneRoot = new THREE.Object3D();//create an empty container

    this.meshVolume = new MeshVolume(this.volume);

    if (this.PT) {
      this.volumeRendering = new PathTracedVolume(this.volume);
      this.pathTracedVolume = this.volumeRendering;
    }
    else {
      this.volumeRendering = new RayMarchedAtlasVolume(this.volume);
      this.rayMarchedAtlasVolume = this.volumeRendering;
    }

    // draw meshes first, and volume last, for blending and depth test reasons with raymarch
    !this.PT && this.sceneRoot.add(this.meshVolume.get3dObject());
    this.sceneRoot.add(this.volumeRendering.get3dObject());
    // draw meshes last (as overlay) for pathtrace? (or not at all?)
    //this.PT && this.sceneRoot.add(this.meshVolume.get3dObject());

    this.bounds = {
      bmin: new THREE.Vector3(-0.5, -0.5, -0.5),
      bmax: new THREE.Vector3(0.5, 0.5, 0.5)
    };

    var cx = 0.0;
    var cz = 0.0;
    var cy = 0.0;
    this.sceneRoot.position.set(cx,cy,cz);
    this.maxSteps = 256;

    this.setScale(this.volume.scale);
    // apply the volume's default transformation
    this.setTranslation(new THREE.Vector3().fromArray(this.volume.getTranslation()));
    this.setRotation(new THREE.Euler().fromArray(this.volume.getRotation()));
  }

  resetSampleRate() {
    this.steps = this.maxSteps / 2;
  }

  setMaxSampleRate(qual) {
    this.maxSteps = qual;
    this.setUniform('maxSteps', qual);
  }

  setScale(scale) {

    this.scale = scale;

    this.currentScale = scale.clone();

    this.meshVolume.setScale(scale);
    this.volumeRendering.setScale(scale);
  }

  setOrthoScale(value) {
    this.volumeRendering.setOrthoScale(value);
  }

  setResolution(viewObj) {
    const x = viewObj.getWidth();
    const y = viewObj.getHeight();
    this.volumeRendering.setResolution(x, y);
    this.meshVolume.setResolution(x, y);
  }

  // Set clipping range (between 0 and 1) for a given axis. 
  // Calling this allows the rendering to compensate for changes in thickness in orthographic views that affect how bright the volume is.
  // @param {number} axis 0, 1, or 2 for x, y, or z axis
  // @param {number} minval 0..1, should be less than maxval
  // @param {number} maxval 0..1, should be greater than minval 
  // @param {boolean} isOrthoAxis is this an orthographic projection or just a clipping of the range for perspective view
  setAxisClip(axis, minval, maxval, isOrthoAxis) {
    this.bounds.bmax[axis] = maxval;
    this.bounds.bmin[axis] = minval;
  
    !this.PT && this.meshVolume.setAxisClip(axis, minval, maxval, isOrthoAxis);
    this.volumeRendering.setAxisClip(axis, minval, maxval, isOrthoAxis);
  }

  // Tell this image that it needs to be drawn in an orthographic mode
  // @param {boolean} isOrtho is this an orthographic projection or a perspective view
  setIsOrtho(isOrtho) {
    this.volumeRendering.setIsOrtho(isOrtho);
  }

  setOrthoThickness(value) {
    !this.PT && this.meshVolume.setOrthoThickness(value);
    this.volumeRendering.setOrthoThickness(value);
  }

  // Set parameters for gamma curve for volume rendering.
  // @param {number} gmin 0..1
  // @param {number} glevel 0..1
  // @param {number} gmax 0..1, should be > gmin
  setGamma(gmin, glevel, gmax) {
    !this.PT && this.rayMarchedAtlasVolume.setGamma(gmin, glevel, gmax);
  }

  setMaxProjectMode(isMaxProject) {
    !this.PT && this.rayMarchedAtlasVolume.setMaxProjectMode(isMaxProject);
  }

  onAnimate(canvas) {
    // TODO: this is inefficient, as this work is duplicated by threejs.
    // we need camera matrix up to date before giving the 3d objects a chance to use it.
    canvas.camera.updateMatrixWorld(true);
    canvas.camera.matrixWorldInverse.getInverse( canvas.camera.matrixWorld );

    const isVR = canvas.isVR();
    if (isVR) {
      // raise volume drawable to about 1 meter.
      this.sceneRoot.position.y = 1.0;
    }
    else {
      this.sceneRoot.position.y = 0.0;
    }

    // TODO confirm sequence
    this.volumeRendering.doRender(canvas);
    !this.PT && this.meshVolume.doRender(canvas);
  }

  // If an isosurface exists, update its isovalue and regenerate the surface. Otherwise do nothing.
  updateIsovalue(channel, value) {
    this.meshVolume.updateIsovalue(channel, value);
  }

  getIsovalue(channel) {
    return this.meshVolume.getIsovalue(channel);
  }

  // Set opacity for isosurface
  updateOpacity(channel, value) {
    this.meshVolume.updateOpacity(channel, value);
  }

  hasIsosurface(channel) {
    return this.meshVolume.hasIsosurface(channel);
  }

  // If an isosurface is not already created, then create one.  Otherwise do nothing.
  createIsosurface(channel, value, alpha, transp) {
    this.meshVolume.createIsosurface(channel, this.channel_colors[channel], value, alpha, transp);
  }

  // If an isosurface exists for this channel, destroy it now. Don't just hide it - assume we can free up some resources.
  destroyIsosurface(channel) {
    this.meshVolume.destroyIsosurface(channel);
  }

  fuse() {
    if (!this.volume) {
      return;
    }

    if (this.PT) {
      this.pathTracedVolume.updateActiveChannels(this);
    }
    else {
      this.rayMarchedAtlasVolume.fuse(this.fusion, this.volume.channels);
    }

  }

  updateMaterial() {
    this.PT && this.pathTracedVolume.updateMaterial(this);
  }

  updateLuts() {
    this.PT && this.pathTracedVolume.updateLuts(this);
    !this.PT && this.rayMarchedAtlasVolume.fuse(this.fusion, this.volume.channels);
  }

  setVoxelSize(values) {
    this.volume.setVoxelSize(values);
    this.setScale(this.volume.scale);
  }

  cleanup() {
    this.meshVolume.cleanup();
    this.volumeRendering.cleanup();
  }

  getChannel(channelIndex) {
    return this.volume.getChannel(channelIndex);
  }

  onChannelLoaded(batch) {
    this.volumeRendering.onChannelData(batch);
    this.meshVolume.onChannelData(batch);

    // let the outside world have a chance
    if (this.onChannelDataReadyCallback) {
      this.onChannelDataReadyCallback();
    }
  }

  onChannelAdded(newChannelIndex) {
    this.channel_colors[newChannelIndex] = this.volume.channel_colors_default[newChannelIndex];

    this.fusion[newChannelIndex] = {
      chIndex: newChannelIndex,
      lut:[],
      rgbColor: [this.channel_colors[newChannelIndex][0], this.channel_colors[newChannelIndex][1], this.channel_colors[newChannelIndex][2]]
    };

    this.specular[newChannelIndex] = [0,0,0];
    this.emissive[newChannelIndex] = [0,0,0];
    this.roughness[newChannelIndex] = 0;

  }

  // Save a channel's isosurface as a triangle mesh to either STL or GLTF2 format.  File will be named automatically, using image name and channel name.
  // @param {string} type Either 'GLTF' or 'STL'
  saveChannelIsosurface(channelIndex, type) {
    this.meshVolume.saveChannelIsosurface(channelIndex, type, this.name);
  }

  // Hide or display volume data for a channel
  setVolumeChannelEnabled(channelIndex, enabled) {
    // flip the color to the "null" value
    this.fusion[channelIndex].rgbColor = enabled ? this.channel_colors[channelIndex] : 0;
    // if all are nulled out, then hide the volume element from the scene.
    if (this.fusion.every((elem)=>(elem.rgbColor === 0))) {
      this.volumeRendering.setVisible(false);
    }
    else {
      this.volumeRendering.setVisible(true);
    }
  }

  isVolumeChannelEnabled(channelIndex) {
    // the zero value for the fusion rgbColor is the indicator that a channel is hidden.
    return this.fusion[channelIndex].rgbColor !== 0;
  }

  // Set the color for a channel
  // @param {Array.<number>} colorrgb [r,g,b]
  updateChannelColor(channelIndex, colorrgb) {
    if (!this.channel_colors[channelIndex]) {
      return;
    }
    this.channel_colors[channelIndex] = colorrgb;
    // if volume channel is zero'ed out, then don't update it until it is switched on again.
    if (this.fusion[channelIndex].rgbColor !== 0) {
      this.fusion[channelIndex].rgbColor = colorrgb;
      this.fuse();
    }
    this.meshVolume.updateMeshColors(this.channel_colors);
  }

  // TODO remove this from public interface?
  updateMeshColors() {
    this.meshVolume.updateMeshColors(this.channel_colors);
  }

  // Get the color for a channel
  // @return {Array.<number>} The color as array of [r,g,b]
  getChannelColor(channelIndex) {
    return this.channel_colors[channelIndex];
  }

  // Set the material for a channel
  // @param {number} channelIndex 
  // @param {Array.<number>} colorrgb [r,g,b]
  // @param {Array.<number>} specularrgb [r,g,b]
  // @param {Array.<number>} emissivergb [r,g,b]
  // @param {number} roughness
  updateChannelMaterial(channelIndex, colorrgb, specularrgb, emissivergb, roughness) {
    if (!this.channel_colors[channelIndex]) {
      return;
    }
    this.updateChannelColor(channelIndex, colorrgb);
    this.specular[channelIndex] = specularrgb;
    this.emissive[channelIndex] = emissivergb;
    this.roughness[channelIndex] = roughness;
  }

  setDensity(density) {
    this.density = density;
    this.volumeRendering.setDensity(density);
  }

  /**
   * Get the global density of the volume data
   */
  getDensity() {
    return this.density;
  }

  setBrightness(brightness) {
    this.brightness = brightness;
    this.volumeRendering.setBrightness(brightness);
  }

  getBrightness() {
    return this.brightness;
  }

  setChannelAsMask(channelIndex) {
    if (!this.volume.channels[channelIndex] || !this.volume.channels[channelIndex].loaded) {
      return false;
    }
    this.maskChannelIndex = channelIndex;
    return this.volumeRendering.setChannelAsMask(channelIndex);
  }

  setMaskAlpha(maskAlpha) {
    this.maskAlpha = maskAlpha;
    this.volumeRendering.setMaskAlpha(maskAlpha);
  }

  getIntensity(c, x, y, z) {
    return this.volume.getIntensity(c, x, y, z);
  }

  onStartControls() {
    this.PT && this.pathTracedVolume.onStartControls();
  }

  onChangeControls() {
    this.PT && this.pathTracedVolume.onChangeControls();
  }

  onEndControls() {
    this.PT && this.pathTracedVolume.onEndControls();
  }

  onCameraChanged(fov, focalDistance, apertureSize) {
    this.PT && this.pathTracedVolume.updateCamera(fov, focalDistance, apertureSize);
  }

  updateClipRegion(xmin, xmax, ymin, ymax, zmin, zmax) {
    this.volumeRendering.updateClipRegion(xmin, xmax, ymin, ymax, zmin, zmax);
  }

  updateLights(state) {
    this.PT && this.pathTracedVolume.updateLights(state);
  }

  setPixelSamplingRate(value) {
    this.volumeRendering.setPixelSamplingRate(value);
  }


  setVolumeRendering(is_pathtrace) {
    if (is_pathtrace === this.PT) {
      return;
    }

    // remove old 3d object from scene
    is_pathtrace && this.sceneRoot.remove(this.meshVolume.get3dObject());
    this.sceneRoot.remove(this.volumeRendering.get3dObject());

    // destroy old resources.
    this.volumeRendering.cleanup();

    // create new
    if (is_pathtrace) {
      this.volumeRendering = new PathTracedVolume(this.volume);
      this.pathTracedVolume = this.volumeRendering;
    }
    else {
      this.volumeRendering = new RayMarchedAtlasVolume(this.volume);
      this.rayMarchedAtlasVolume = this.volumeRendering;

      for (var i = 0; i < this.volume.num_channels; ++i) {
        this.rayMarchedAtlasVolume.onChannelData([i]);
      }
    }

    // ensure transforms on new volume representation are up to date
    this.volumeRendering.setTranslation(this.translation);
    this.volumeRendering.setRotation(this.rotation);
  
    this.PT = is_pathtrace;

    this.setChannelAsMask(this.maskChannelIndex);
    this.setMaskAlpha(this.maskAlpha);
    this.setScale(this.volume.scale);
    this.setBrightness(this.getBrightness());
    this.setDensity(this.getDensity());

    // add new 3d object to scene
    !this.PT && this.sceneRoot.add(this.meshVolume.get3dObject());
    this.sceneRoot.add(this.volumeRendering.get3dObject());

    this.fuse();
  }

  setTranslation(xyz) {
    this.translation.copy(xyz);
    this.volumeRendering.setTranslation(this.translation);
    this.meshVolume.setTranslation(this.translation);
  }

  setRotation(eulerXYZ) {
    this.rotation.copy(eulerXYZ);
    this.volumeRendering.setRotation(this.rotation);
    this.meshVolume.setRotation(this.rotation);
  }

};
