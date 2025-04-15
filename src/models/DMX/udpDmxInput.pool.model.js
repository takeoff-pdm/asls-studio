import UDPDMXInput from '@/plugins/udpDmxInput';

/**
 * @class UDPDMXInputPool
 * @classdesc Pool of UDP DMX input instances
 */
class UDPDMXInputPool {
  constructor() {
    this.inputs = [];
    this.selected = [0];
  }

  /**
   * Inputs exportable show data chunk
   *
   * @readonly
   * @type {Object}
   */
  get showData() {
    return this.inputs.map((input) => ({
      id: input.id,
      name: input.name,
      port: input.port,
      universe: input.universe.id,
    }));
  }

  /**
   * Pool's listable data
   *
   * @readonly
   * @type {Array}
   */
  get listable() {
    return this.inputs.map((input) => ({
      id: input.id,
      name: `${input.name} - Port ${input.port}`,
      icon: 'input',
      action: {
        label: input.isRunning ? 'disconnect' : 'connect',
        action: input.isRunning ? input.stop.bind(input) : input.connect.bind(input),
      },
    }));
  }

  /**
   * Returns input instance from provided ID
   *
   * @public
   * @param {Number} id
   * @return {Object} UDPDMXInput instance
   */
  getFromId(id) {
    const input = this.inputs.find((i) => i.id === Number(id));
    if (input) {
      return input;
    }
    throw new Error('Cannot find UDP DMX input in pool');
  }

  /**
   * Creates a new UDP DMX input instance from provided configuration data and pushes it to the pool
   *
   * @public
   * @param {Object} inputData input configuration object
   * @return {Object} UDPDMXInput instance
   */
  addRaw(inputData = {}) {
    try {
      const input = new UDPDMXInput(
        inputData.port || 6454, // Default ArtNet port
        inputData.universe,
        inputData.name || `UDP DMX Input ${this.inputs.length + 1}`,
      );
      input.id = this.genInputId();
      this.inputs.push(input);
      return input;
    } catch (err) {
      console.log(err);
      return err;
    }
  }

  /**
   * Removes input from pool
   *
   * @public
   * @param {Object} input input instance handle
   */
  delete(input) {
    const inputIndex = this.inputs.findIndex((item) => item.id === input.id);
    if (inputIndex > -1) {
      this.inputs[inputIndex].handleClosure();
      this.inputs.splice(inputIndex, 1);
    } else {
      throw new Error('Could not find UDP DMX input in pool');
    }
  }

  /**
   * Clears all input instances from pool
   *
   * @public
   */
  clearAll() {
    for (let i = this.inputs.length - 1; i >= 0; i--) {
      this.delete(this.inputs[i]);
    }
  }

  /**
   * Generates input unique ID
   *
   * @public
   * @returns {Number} The input's unique ID
   */
  genInputId() {
    return this.inputs.reduce(
      (prev, current) => (
        (prev && prev.id > current.id)
          ? prev.id
          : current.id
      ),
      -1,
    ) + 1;
  }
}

export default UDPDMXInputPool; 