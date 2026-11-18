class KernelSpike extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.instance = new WebAssembly.Instance(options.processorOptions.module);
    this.address = this.instance.exports.nt_context();
    this.arena = new Float32Array(this.instance.exports.memory.buffer, this.address, 772);
    this.arena.fill(0);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (input.length !== 4 || output.length !== 2 || output[0].length !== 128) {
      throw new Error("Spike requires four input channels and two output channels at 128 frames");
    }
    for (let frame = 0; frame < 128; ++frame) {
      for (let channel = 0; channel < 2; ++channel) {
        this.arena[frame * 2 + channel] = input[channel][frame];
        this.arena[256 + frame * 2 + channel] = input[channel + 2][frame];
      }
    }
    this.instance.exports.nt_process(this.address);
    for (let frame = 0; frame < 128; ++frame) {
      for (let channel = 0; channel < 2; ++channel) {
        output[channel][frame] = this.arena[512 + frame * 2 + channel];
      }
    }
    return true;
  }
}
registerProcessor("kernel-spike", KernelSpike);
