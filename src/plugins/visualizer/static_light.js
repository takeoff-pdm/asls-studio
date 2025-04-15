import * as THREE from 'three';
import ModelInstancer from './model_instancer';
// TODO: find a way for the linter to acces vite's '?' syntax
import VOLUMETRIC_BEAM_VERTEX_SHADER from './shaders/beam.vertex.glsl?raw';
import VOLUMETRIC_BEAM_FRAGMENT_SHADER from './shaders/beam.fragment.glsl?raw';

const MODEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  transparent: false,
  flatShading: false,
  side: THREE.DoubleSide,
  clippingPlanes: true,
});

MODEL_MATERIAL.onBeforeCompile = (shader) => {
  // the rest is the same
  shader.vertexShader = shader.vertexShader.replace(
    '#define STANDARD\n',
    `#define STANDARD
         attribute float highlight;
         varying float vHighlight;`,
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <clipping_planes_vertex>\n\t',
    '#include <clipping_planes_vertex>\nvHighlight = highlight;\n',
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    'varying vec3 vViewPosition;\n',
    'varying vec3 vViewPosition;\nvarying float vHighlight;\n',
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    'totalEmissiveRadiance = emissive;\n',
    'totalEmissiveRadiance = vHighlight == 0.0 ? emissive : vec3(.658,.176,.345);\n',
  );
  MODEL_MATERIAL.userData.shader = shader;
};

const MAX_INSTANCES = 100;
const vector_cam = new THREE.Vector3();
const vector_beam = new THREE.Vector3();
const vector_beam_pos = new THREE.Vector3();
const vector_cam_pos = new THREE.Vector3();

const BEAM_RESOLUTION = 100;
const BEAM_SEGMENTS = 1;
const BEAM_LENGTH = 100;
const BEAM_TOP_RADIUS = 0.12;
const BEAM_MAX_ANGLE = 45;

const SPOTLIGHT_PHYSICALLY_CORRECT_DISTANCE = 0;
const SPOTLIGHT_PHYSICALLY_CORRECT_INTENSITY = 100.0;
const SPOTLIGHT_PHYSICALLY_CORRECT_DECAY = 1.0;
const SPOTLIGHT_PHYSICALLY_CORRECT_PENUMBRA = 1.2;

const DEFAULT_COLOR_TEMP = 8000;

const negativeZOffset = 0.1;

const SLOT_TYPES = {
  OPEN: 'Open',
  COLOR: 'Color',
  GOBO: 'Gobo',
};

const SHUTTER_STROBE_EFFETCS = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  STROBE: 'Strobe',
  PULSE: 'Strobe',
  RAMP_UP: 'RampUp',
  RAMP_DOWN: 'RampDown',
  RAMP_UP_DOWN: 'RampUpDown',
  LIGHTNING: 'Lighting',
  SPIKES: 'Spikes',
};

const SHUTTER_VALUE = {
  OPEN: 1.0,
  CLOSED: 0.0,
};

const SHUTTER_STROBE_FREQUENCIES_DEFAULT = {
  SLOW: 1,
  FAST: 10,
};

const position_buffer_attribute = new THREE.InstancedBufferAttribute(
  new Float32Array(MAX_INSTANCES * 3),
  3,
);
const direction_buffer_attribute = new THREE.InstancedBufferAttribute(
  new Float32Array(MAX_INSTANCES * 3),
  3,
);
const intensity_buffer_attribute = new THREE.InstancedBufferAttribute(
  new Float32Array(MAX_INSTANCES),
  1,
);
const color_buffer_attribute = new THREE.InstancedBufferAttribute(
  new Float32Array(MAX_INSTANCES * 3),
  3,
);
const emissive_buffer_attribute = new THREE.InstancedBufferAttribute(
  new Float32Array(MAX_INSTANCES),
  1,
);
const angle_buffer_attribute = new THREE.InstancedBufferAttribute(
  new Float32Array(MAX_INSTANCES * 2),
  2,
);

const baseGeo = new THREE.InstancedBufferGeometry();
const yokeGeo = new THREE.InstancedBufferGeometry();
const headGeo = new THREE.InstancedBufferGeometry();
const beamGeo = new THREE.InstancedBufferGeometry();
const targetGeo = new THREE.InstancedBufferGeometry();
const boundingBoxGeo = new THREE.InstancedBufferGeometry();

let baseMesh;
let yokeMesh;
let headMesh;
let beamMesh;
let capMesh;
let boundingBoxMesh;

let camera_handle = null;
let scene_handle = null;

const instances = [];
let instanceCount = 0;

/**
 * Defines a 3D moving head instance
 *
 * @class MovingHead
 */
class StaticLight {
  /**
   * Creates an instance of MovingHead.
   * @param {string} [data={
   *     minAngle: 0.0,
   *     maxAngle: 10.0,
   *     minTilt: 0.0,
   *     maxTilt: 0.0,
   *     minPan: 0.0,
   *     maxPan: 0.0,
   *     color: 'white',
   *     colorTemp: DEFAULT_COLOR_TEMP,
   *     intensity: 0.0,
   *     pan: 0.0,
   *     tilt: 0.0,
   *     goboWheel: [],
   *     colorWheel: []
   *   }]
   * @memberof MovingHead
   */
  constructor(data = {
    minAngle: 0.0,
    maxAngle: 10.0,
    minTilt: 0.0,
    maxTilt: 0.0,
    minPan: 0.0,
    maxPan: 0.0,
    color: 'white',
    colorTemp: DEFAULT_COLOR_TEMP,
    intensity: 0.0,
    pan: 0.0,
    tilt: 0.0,
    goboWheel: [],
    colorWheel: [],
  }) {
    // Check if meshes are initialized
    if (!baseMesh || !yokeMesh || !headMesh || !beamMesh) {
      throw new Error('StaticLight meshes are not initialized. Call StaticLight.prepareInstanciation(camera, scene) first.');
    }
    
    this._id = instanceCount++;
    this._position = new THREE.Vector3();
    this._rotation = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._minAngle = data.minAngle + 1.0;
    this._maxAngle = data.maxAngle + 1.0;
    this._shutter = SHUTTER_VALUE.OPEN;
    this._goboWheel = data.goboWheel;
    this._colorWheel = data.colorWheel;
    this._activeColorPreset = false;
    this._highlighted = false;

    this.prepareInstance();

    this.angle = this._maxAngle;
    this.color = data.color;
    this.colorTemp = data.colorTemp;
    this.intensity = data.intensity;
    this.minTilt = data.minTilt;
    this.maxTilt = data.maxTilt;
    this.minPan = data.minPan;
    this.maxPan = data.maxPan;
    this.pan = data.pan;
    this.tilt = data.tilt;
    this.strobeFrequency = 0.0;

    this._shutterStrobe = {
      effect: SHUTTER_STROBE_EFFETCS.OPEN,
      frequency: SHUTTER_STROBE_FREQUENCIES_DEFAULT.SLOW,
    };
  }

  /**
   * Instance ID
   *
   * @type {Number}
   */
  set id(id) {
    this._id = id;
  }

  get id() {
    return this._id;
  }

  /**
   * Beam angle
   *
   * @type {Number}
   */
  set angle(angle) {
    // Use a wider angle range for a broader beam
    const clampedAngleValue = Math.min(angle / 1.5, BEAM_MAX_ANGLE * 1.2);
    if (clampedAngleValue !== this._angle) {
      this._angle = clampedAngleValue;
      this._spotLight.angle = StaticLight.degToRad(this.angle);
      angle_buffer_attribute.setY(this._id, 1.0);
      angle_buffer_attribute.setX(this._id, this.angle);
    } else {
      angle_buffer_attribute.setY(this._id, 0.0);
    }
    angle_buffer_attribute.needsUpdate = true;
  }

  get angle() {
    return this._angle || 10.0;
  }

  /**
   * Beam color
   *
   * @type {String}
   */
  set color(color) {
    this._color = color instanceof THREE.Color ? color : new THREE.Color(color);
    this._spotLight.color = this._color;
    color_buffer_attribute.setXYZ(this._id, this._color.r, this._color.g, this._color.b);
    color_buffer_attribute.needsUpdate = true;
  }

  get color() {
    return this._color || new THREE.Color('white');
  }

  /**
   * Pan value in degrees
   *
   * @type {Number}
   */
  set pan(panAngle) {
    // Static lights don't pan - this is a no-op
    this._pan = panAngle;
  }

  get pan() {
    return this._pan || 0.0;
  }

  /**
   * Pan-fine value in degrees
   *
   * @type {Number}
   */
  set panFine(fineAngle) {
    // Static lights don't pan - this is a no-op
    this._panFine = fineAngle;
  }

  get panFine() {
    return this._panFine || 0.0;
  }

  /**
   * Tilt value in degrees
   *
   * @type {Number}
   */
  set tilt(tiltAngle) {
    // Static lights don't tilt - this is a no-op
    this._tilt = tiltAngle;
  }

  get tilt() {
    return this._tilt || 0.0;
  }

  /**
   * Tilt-fine value in degrees
   *
   * @type {Number}
   */
  set tiltFine(fineAngle) {
    // Static lights don't tilt - this is a no-op
    this._tiltFine = fineAngle;
  }

  get tiltFine() {
    return this._tiltFine || 0.0;
  }

  /**
   * Beam intensity
   * @todo path shutter bug
   *
   * @type {Number}
   */

  set intensity(intensity) {
    this._intensity = Math.min(Math.abs(intensity), 1.0);
    this._spotLight.intensity = SPOTLIGHT_PHYSICALLY_CORRECT_INTENSITY * this._intensity;
    intensity_buffer_attribute.setX(this._id, this._intensity);
    intensity_buffer_attribute.needsUpdate = true;
  }

  get intensity() {
    return this._intensity * this._shutter || 0.0;
  }

  /**
   * Beam radius
   *
   * @type {Number}
   * @private
   */
  get radius() {
    const angle = StaticLight.degToRad(this._angle);
    const height = BEAM_TOP_RADIUS / Math.tan(angle) + BEAM_LENGTH;
    const radius = Math.tan(angle) * height;
    return radius;
  }

  /**
   * Vertex scaling factor used for angle definition through vertex transformation
   *
   * @type {Number}
   * @todo check if it is used
   * @private
   */
  get vertexScaleFactor() {
    return this.radius / BEAM_TOP_RADIUS;
  }

  /**
   * Moving Head position in 3D space
   *
   * @type {Object}
   */
  set position(positionVector) {
    // Store original position without adjustment for height
    this._position = positionVector;
    // Position the fixture without adjusting height
    this._dummy.position.set(
      positionVector.x,
      positionVector.y,
      Math.max(positionVector.z, 0.01), // Keep it above ground but don't artificially lower
    );
    this._matrixNeedsUpdate = true;
  }

  get position() {
    return this._position;
  }

  /**
   * Moving Head rotaition in 3D space
   *
   * @type {Object}
   */
  set rotation(rotationVector) {
    this._rotation = rotationVector;
    this._dummy.rotation.set(
      rotationVector.x,
      rotationVector.y,
      rotationVector.z,
    );
    
    // For static lights, update the beam direction based on rotation
    this._beamDummy.rotation.set(0, 0, 0); // Reset beam rotation
    
    this._matrixNeedsUpdate = true;
  }

  get rotation() {
    return this._rotation;
  }

  /**
   * Beam strobe frequency in HZ
   *
   * @type {Number}
   */
  set strobeFrequency(frequency) {
    this._strobeFrequency = Math.round(frequency);
  }

  get strobeFrequency() {
    return this._strobeFrequency;
  }

  /**
   * Beam instance highlighting state
   *
   * @type {Boolean}
   * @private
   */
  set highlighted(state) {
    this._highlighted = state;
    emissive_buffer_attribute.setX(this._id, this._highlighted ? 1.0 : 0.0);
    emissive_buffer_attribute.needsUpdate = true;
  }

  get highlighted() {
    return this._highlighted;
  }

  static highlight(instanceId) {
    const instance = StaticLight.getInstance(instanceId);
    instance.highlighted = true;
  }

  static clearHiglighting() {
    instances.forEach((instance) => {
      instance.highlighted = false;
    });
  }

  set zoom(zoomValue) {
    const angle = this._maxAngle * (zoomValue / 100);
    const clampedAngleValue = Math.min(angle / 2, BEAM_MAX_ANGLE);
    this._angle = clampedAngleValue;
    this._spotLight.angle = StaticLight.degToRad(this._angle);
    angle_buffer_attribute.setY(this._id, 1.0);
    angle_buffer_attribute.setX(this._id, this._angle);
    angle_buffer_attribute.needsUpdate = true;
  }

  set focus(focus) {
    // Lower minimum penumbra value for a cleaner beam edge
    this._spotLight.penumbra = Math.max(
      SPOTLIGHT_PHYSICALLY_CORRECT_PENUMBRA - SPOTLIGHT_PHYSICALLY_CORRECT_PENUMBRA * (focus / 100),
      0.1, // Reduced from 0.3 for a cleaner edge
    );
  }

  /**
   * Color wheel slot value
   *
   * @type {Number}
   */
  set colorWheelSlot(slotId) {
    if (this._colorWheel.length && slotId < this._colorWheel.length) {
      const slotValue = this._colorWheel[slotId];
      if (slotValue.type === SLOT_TYPES.COLOR) {
        this.color = slotValue.colors ? slotValue.colors[0] : 'white';
      } else if (slotValue.type === SLOT_TYPES.OPEN) {
        this.colorTemp = this._colorTemp;
      }
    }
  }

  /**
   * Color preset slot value
   *
   * @type {Number}
   */
  set colorPreset(value) {
    if (value) {
      this._activeColorPreset = true;
      this.color = value;
    } else {
      this._activeColorPreset = false;
    }
  }

  /**
   * Bulb/Beam color temperature in Kelvin
   * props to:  http://www.tannerhelland.com/4435/convert-temperature-rgb-algorithm-code/
   *
   * @type {Number}
   */
  set colorTemp(colorTemp = DEFAULT_COLOR_TEMP) {
    const temp = colorTemp / 100;
    let rgbData = [0, 0, 0];
    if (temp <= 66) {
      rgbData = [
        255,
        99.4708025861 * Math.log(temp) - 161.1195681661,
        temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307,
      ];
    } else {
      rgbData = [
        329.698727446 * (temp - 60) ** -0.1332047592,
        288.1221695283 * (temp - 60) ** -0.0755148492,
        255,
      ];
    }
    this._colorTemp = colorTemp;
    this.color = `rgb(
            ${Math.round(Math.min(Math.max(rgbData[0], 0), 255))},
            ${Math.round(Math.min(Math.max(rgbData[1], 0), 255))},
            ${Math.round(Math.min(Math.max(rgbData[2], 0), 255))}
        )`;
  }

  /**
   * Single color-chanel intensity value (RGBCMY...)
   *
   * @type {Object}
   */
  set colorIntensity(channelData) {
    if (!this._activeColorPreset) {
      const color_tmp = this.color;
      const channel = channelData.color.toLowerCase().charAt(0);
      switch (channel) {
        case 'r':
        case 'g':
        case 'b':
          color_tmp[channel] = Math.max(channelData.colorBrightness, 0.00001);
          this.color = color_tmp;
          break;
        case 'c':
          color_tmp.r = Math.max(1.0 - channelData.colorBrightness, 0.00001);
          this.color = color_tmp;
          break;
        case 'm':
          color_tmp.g = Math.max(1.0 - channelData.colorBrightness, 0.00001);
          this.color = color_tmp;
          break;
        case 'y':
          color_tmp.b = Math.max(1.0 - channelData.colorBrightness, 0.00001);
          this.color = color_tmp;
          break;
        default: break;
      }
    }
  }

  /**
   * Hilight a single moving head instance within the pool
   *
   * @param {Boolean} state highlighting state
   * @memberof MovingHead
   */
  setSinglyHighlighted(state) {
    instances.forEach((instance) => {
      instance.highlighted = false;
    });
    this.highlighted = state;
  }

  /**
   * Prepare new moving head instance
   *
   * @private
   */
  prepareInstance() {
    this._dummy = new THREE.Object3D();
    this._beamDummy = new THREE.Object3D();
    this._targetDummy = new THREE.Object3D();
    this._boundingBoxDummy = new THREE.Object3D();

    this._spotLight = new THREE.SpotLight(
      this.colorTemp,
      SPOTLIGHT_PHYSICALLY_CORRECT_INTENSITY,
      SPOTLIGHT_PHYSICALLY_CORRECT_DISTANCE,
      StaticLight.degToRad(this.angle),
      SPOTLIGHT_PHYSICALLY_CORRECT_PENUMBRA,
      SPOTLIGHT_PHYSICALLY_CORRECT_DECAY,
    );

    // Point the light downward for static lights
    this._spotLight.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    this._spotLight.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0));

    // Align the beam origin precisely with the front of the fixture
    // The body center is at z = -0.175, and the body length is 0.35,
    // so the front face is at z = 0 from the center
    this._beamDummy.position.set(0, 0, 0);
    
    this._dummy.add(this._beamDummy);
    this._beamDummy.attach(this._targetDummy);
    this._beamDummy.attach(this._spotLight);

    // Move the target further away to ensure proper beam direction
    this._targetDummy.position.set(0, 0, -BEAM_LENGTH);
    this._spotLight.target = this._targetDummy;

    baseMesh.count = instanceCount;
    yokeMesh.count = instanceCount;
    headMesh.count = instanceCount;
    beamMesh.count = instanceCount;
    capMesh.count = instanceCount;
    boundingBoxMesh.count = instanceCount;

    scene_handle.add(this._dummy);
    instances.push(this);
    this._matrixNeedsUpdate = true;
  }

  /**
   * Updates the Moving Head instance and childs matrixworld
   *
   * @private
   */
  updateMatrix() {
    if (this._matrixNeedsUpdate) {
      this._dummy.updateMatrixWorld();
      this._beamDummy.updateMatrixWorld();
      this._targetDummy.updateMatrixWorld();
      
      // Set matrices for all meshes
      baseMesh.setMatrixAt(this._id, this._dummy.matrixWorld);
      yokeMesh.setMatrixAt(this._id, this._dummy.matrixWorld);
      headMesh.setMatrixAt(this._id, this._dummy.matrixWorld);
      beamMesh.setMatrixAt(this._id, this._beamDummy.matrixWorld);
      capMesh.setMatrixAt(this._id, this._targetDummy.matrixWorld);
      
      // Set bounding box matrix - match exactly with the fixture position
      boundingBoxMesh.setMatrixAt(this._id, this._dummy.matrixWorld);
      
      // Update all instance matrices
      baseMesh.instanceMatrix.needsUpdate = true;
      yokeMesh.instanceMatrix.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
      beamMesh.instanceMatrix.needsUpdate = true;
      capMesh.instanceMatrix.needsUpdate = true;
      boundingBoxMesh.instanceMatrix.needsUpdate = true;
    }
  }

  updateDirectionVector() {
    // Get the forward direction of the beam
    this._beamDummy.getWorldDirection(vector_beam.normalize());
    direction_buffer_attribute.setXYZ(this._id, vector_beam.x, vector_beam.y, vector_beam.z);
    direction_buffer_attribute.needsUpdate = true;
    
    // Get the position of the beam origin
    this._beamDummy.getWorldPosition(vector_beam_pos);
    position_buffer_attribute.setXYZ(
      this._id,
      vector_beam_pos.x,
      vector_beam_pos.y,
      vector_beam_pos.z,
    );
    position_buffer_attribute.needsUpdate = true;
  }

  updateStrobe(t) {
    if (this._strobeFrequency > 0.0) {
      this._shutter = Math.sin(2.0 * Math.PI * this._strobeFrequency * t) > 0.0
        ? SHUTTER_VALUE.OPEN
        : SHUTTER_VALUE.CLOSED;
    } else {
      this._shutter = 1.0;
    }

    // eslint-disable-next-line max-len
    this._spotLight.intensity = SPOTLIGHT_PHYSICALLY_CORRECT_INTENSITY * this.intensity * this._shutter;
    intensity_buffer_attribute.setX(this._id, this.intensity * this._shutter);
    intensity_buffer_attribute.needsUpdate = true;
  }

  update(t) {
    this.updateStrobe(t);
    this.updateMatrix();
    this.updateDirectionVector();
    
    // Update the quaternion from rotation
    this._quaternion.setFromEuler(new THREE.Euler(
      StaticLight.degToRad(this._rotation.x),
      StaticLight.degToRad(this._rotation.y),
      StaticLight.degToRad(this._rotation.z),
      'XYZ'
    ));
    
    // Update DMX response values - use existing properties
    this._spotLight.intensity = this.intensity * this._shutter;
    this._spotLight.color = this.color;
    
    // Get the world position for the spotlight
    this._beamDummy.getWorldPosition(vector_beam_pos);
    this._spotLight.position.copy(vector_beam_pos);
    
    // Set the target position relative to the beam origin in local coordinates
    this._targetDummy.position.set(0, 0, -BEAM_LENGTH);
    
    // Force the target to update its world position
    this._targetDummy.updateMatrixWorld(true);
    
    // Set matrixNeedsUpdate to ensure matrices are recalculated next frame
    this._matrixNeedsUpdate = true;
  }

  static degToRad(degAngle) {
    return degAngle * (Math.PI / 180);
  }

  static prepareModelInstance() {
    // Create a main body for the Eurolite LED PARty TCL Spot
    // Tapered cylinder for the main body
    const bodyGeometry = new THREE.CylinderGeometry(0.20, 0.185, 0.35, 32);
    bodyGeometry.rotateX(Math.PI / 2); // Rotate to point forward
    bodyGeometry.translate(0, 0, -0.175 - negativeZOffset); // Center the cylinder
    
    // Create fixture material with texture
    const fixtureMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,  // Dark gray for the body
      roughness: 0.8,   // Fairly rough surface
      metalness: 0.2,   // Slightly metallic look
      flatShading: false,
      side: THREE.DoubleSide,
    });
    
    THREE.BufferGeometry.prototype.copy.call(baseGeo, bodyGeometry);
    
    // Create a rim geometry for the secondary part (rim around lens)
    const rimGeometry = new THREE.CylinderGeometry(0.20, 0.20, 0.03, 32);
    rimGeometry.rotateX(Math.PI / 2);
    rimGeometry.translate(0, 0, 0.01 - negativeZOffset); // Position the rim at the front of the fixture
    
    THREE.BufferGeometry.prototype.copy.call(yokeGeo, rimGeometry);
    
    // Create cooling fins for the back (heatsink)
    // We'll create a simple representation using a series of small boxes
    const finGeometry = new THREE.BufferGeometry();
    const finPositions = [];
    const finCount = 16; // Increased number of fins for better coverage
    const finHeight = 0.01; // Reduced height to make fins less prominent
    const finDepth = 0.3; // Increased depth to span most of the fixture body
    const finWidth = 0.08; // Reduced width for more subtle fins
    
    for (let i = 0; i < finCount; i++) {
      // Calculate the angle for positioning around the cylinder
      const angle = (i / finCount) * Math.PI * 2;
      const x = Math.cos(angle) * 0.19; // Position slightly inside the outer edge
      const y = Math.sin(angle) * 0.19;
      
      // Create a simple box for each fin
      const boxGeometry = new THREE.BoxGeometry(finWidth, finHeight, finDepth);
      // Position fins to cover the entire body length
      boxGeometry.translate(0, 0, -0.175 - negativeZOffset); // Center fins on the body
      
      // Rotate and position the fin
      const matrix = new THREE.Matrix4()
        .makeRotationZ(angle)
        .setPosition(x, y, 0);
      
      boxGeometry.applyMatrix4(matrix);
      
      // Extract positions and add to the fin positions array
      const positions = boxGeometry.attributes.position.array;
      for (let j = 0; j < positions.length; j++) {
        finPositions.push(positions[j]);
      }
    }
    
    // Create the fin geometry from the positions
    finGeometry.setAttribute('position', new THREE.Float32BufferAttribute(finPositions, 3));
    finGeometry.computeVertexNormals();
    
    THREE.BufferGeometry.prototype.copy.call(headGeo, finGeometry);

    baseGeo.setAttribute('highlight', emissive_buffer_attribute);
    yokeGeo.setAttribute('highlight', emissive_buffer_attribute);
    headGeo.setAttribute('highlight', emissive_buffer_attribute);

    // Create the meshes with appropriate materials
    baseMesh = new THREE.InstancedMesh(baseGeo, fixtureMaterial, MAX_INSTANCES);
    
    // Rim material - slightly different color for contrast
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,  // Slightly lighter for the rim
      roughness: 0.6,
      metalness: 0.3,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    
    yokeMesh = new THREE.InstancedMesh(yokeGeo, rimMaterial, MAX_INSTANCES);
    
    // Heatsink material - aluminum look
    const heatsinkMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,  // Light metallic color
      roughness: 0.4,
      metalness: 0.7,   // More metallic for the heatsink
      flatShading: true, // Use flat shading for the fins
      side: THREE.DoubleSide,
    });
    
    headMesh = new THREE.InstancedMesh(headGeo, heatsinkMaterial, MAX_INSTANCES);

    baseMesh.frustumCulled = false;
    yokeMesh.frustumCulled = false;
    headMesh.frustumCulled = false;

    baseMesh.count = instanceCount;
    yokeMesh.count = instanceCount;
    headMesh.count = instanceCount;

    baseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    yokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    headMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    baseMesh.instanceMatrix.needsUpdate = true;
    yokeMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
  }

  static prepareBeamInstance() {
    // Create a more even, broad beam profile
    const beamGeometry = new THREE.CylinderGeometry(
      BEAM_TOP_RADIUS * 1.2,       // Wider start radius
      BEAM_TOP_RADIUS * 1.1,       // Almost the same end radius for a less pointed shape
      BEAM_LENGTH,
      BEAM_RESOLUTION * 1.5,       // More segments for a smoother, rounder appearance
      BEAM_SEGMENTS * 2,           // More segments along the length for smoother shape
      true,
    );

    beamGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(
      0,
      -beamGeometry.parameters.height / 2,
      0,
    ));
    beamGeometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    // Position beam to start properly aligned with the fixture front
    beamGeometry.applyMatrix4(new THREE.Matrix4().setPosition(0, 0, 0 - negativeZOffset));

    THREE.BufferGeometry.prototype.copy.call(beamGeo, beamGeometry);

    const verticesIndexBuffer = [];
    for (let i = 0; i < beamGeo.attributes.position.count; i++) {
      verticesIndexBuffer[i] = i;
    }
    const indexAttributes = new THREE.BufferAttribute(
      new Float32Array(verticesIndexBuffer),
      1,
    ).setUsage(THREE.StaticDrawUsage);

    beamGeo.setAttribute('index', indexAttributes);
    beamGeo.setAttribute('wpos', position_buffer_attribute);
    beamGeo.setAttribute('direction', direction_buffer_attribute);
    beamGeo.setAttribute('color', color_buffer_attribute);
    beamGeo.setAttribute('intensity', intensity_buffer_attribute);
    beamGeo.setAttribute('angle', angle_buffer_attribute);

    beamMesh = new THREE.InstancedMesh(beamGeo, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      clipping: false,  // Disable clipping to prevent the beam from being cut off
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: VOLUMETRIC_BEAM_VERTEX_SHADER,
      fragmentShader: VOLUMETRIC_BEAM_FRAGMENT_SHADER,
      fog: false,
      toneMapped: false,
      dithering: false,
      uniforms: {
        cameraDir: {
          type: 'v3',
          value: vector_cam,
        },
        cameraPos: {
          type: 'v3',
          value: vector_cam_pos,
        },
        vertexCount: {
          type: 'f',
          value: beamGeo.attributes.position.count,
        },
        topRadius: {
          type: 'f',
          value: BEAM_TOP_RADIUS * 1.2, // Match the wider radius used in geometry
        },
        length: {
          type: 'f',
          value: BEAM_LENGTH,
        },
        time: {
          type: 'f',
          value: 0.0,
        },
        fogState: {
          type: 'b',
          value: true,
        },
        fogFactor: {
          type: 'f',
          value: 1.0,
        },
        fogTurbulence: {
          type: 'f',
          value: 1.0,
        },
        glowFactor: {
          type: 'f',
          value: 1.5, // Increased glow for a broader, softer appearance
        },
      },
    }), MAX_INSTANCES);

    beamMesh.count = instanceCount;
    beamMesh.frustumCulled = false;
    beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    beamMesh.instanceMatrix.needsUpdate = true;
  }

  static prepareCapInstance() {
    // Create a broader, rounder lens
    const lensGeometry = new THREE.CircleGeometry(0.19, 48); // Increased radius and segments for rounder appearance
    
    // Create a diffuse, frosted lens material typical of wash lights
    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,           // White base color
      roughness: 0.25,           // Slightly rougher for diffusion
      metalness: 0.0,            // Not metallic at all
      transmission: 0.85,        // Highly transparent
      transparent: true,
      opacity: 0.9,              // Slightly more opaque for a frosted look
      clearcoat: 0.8,            // Slightly reduced clear coat
      clearcoatRoughness: 0.3,   // Rougher clear coat for diffusion
      side: THREE.DoubleSide,
    });

    // Position the lens right at the front of the fixture to eliminate gaps
    lensGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.01 - negativeZOffset));

    THREE.BufferGeometry.prototype.copy.call(targetGeo, lensGeometry);

    capMesh = new THREE.InstancedMesh(targetGeo, lensMaterial, MAX_INSTANCES);
    capMesh.frustumCulled = false;
    capMesh.count = instanceCount;
    capMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    capMesh.instanceMatrix.needsUpdate = true;
  }

  static prepareBoxHelperInstance() {
    // Create a bounding box that approximates the cylindrical shape
    // Make it match the actual body dimensions
    const boundingBoxGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.35);
    const boundingBoxMaterial = new THREE.MeshBasicMaterial({
      color: 'rgb(255, 0, 0)',
      opacity: 0.0,
      transparent: true,
    });

    // Center the box on the fixture body exactly
    boundingBoxGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -0.175));

    THREE.BufferGeometry.prototype.copy.call(boundingBoxGeo, boundingBoxGeometry);

    boundingBoxMesh = new THREE.InstancedMesh(boundingBoxGeo, boundingBoxMaterial, MAX_INSTANCES);
    boundingBoxMesh.frustumCulled = false;
    boundingBoxMesh.count = instanceCount;
    boundingBoxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    boundingBoxMesh.instanceMatrix.needsUpdate = true;
    boundingBoxMesh.visible = false;
  }

  static prepareInstanciation(camera, scene) {
    camera_handle = camera;
    scene_handle = scene;
    StaticLight.prepareModelInstance();
    StaticLight.prepareBeamInstance();
    StaticLight.prepareCapInstance();
    StaticLight.prepareBoxHelperInstance();

    scene.add(baseMesh, yokeMesh, headMesh, beamMesh, capMesh, boundingBoxMesh);
  }

  static update(t) {
    instances.forEach((instance) => {
      instance.update(t);
    });
    beamMesh.material.uniforms.time.value = t;
    camera_handle.getWorldDirection(vector_cam.normalize());
    beamMesh.material.uniforms.cameraDir.value = vector_cam;
    camera_handle.getWorldPosition(vector_cam_pos.normalize());
    beamMesh.material.uniforms.cameraPos.value = vector_cam_pos;
  }

  static deleteInstance(instance) {
    scene_handle.remove(instance._beamDummy);
    scene_handle.remove(instance._spotLight);
    scene_handle.remove(instance._dummy);

    instances.splice(instance.id, 1);
    for (let i = instance.id; i < instanceCount - 1; i++) {
      instances[i].id--;
    }
    instance = null;
    instanceCount--;

    baseMesh.count = instanceCount;
    yokeMesh.count = instanceCount;
    headMesh.count = instanceCount;
    beamMesh.count = instanceCount;
    capMesh.count = instanceCount;
    boundingBoxMesh.count = instanceCount;
  }

  static getBA() {
    return position_buffer_attribute;
  }

  static set fogState(value) {
    beamMesh.material.uniforms.fogState.value = value;
  }

  static get fogState() {
    return beamMesh.material.uniforms.fogState.value;
  }

  static set fogDensity(value) {
    beamMesh.material.uniforms.fogFactor.value = value;
  }

  static get fogDensity() {
    return beamMesh.material.uniforms.fogFactor.value;
  }

  static set fogTurbulence(value) {
    beamMesh.material.uniforms.fogTurbulence.value = value;
  }

  static get fogTurbulence() {
    return beamMesh.material.uniforms.fogTurbulence.value;
  }

  static get instancedMesh() {
    boundingBoxMesh.computeBoundingSphere();
    return boundingBoxMesh;
  }

  static getInstance(id) {
    return instances[id];
  }
}

export default StaticLight;
