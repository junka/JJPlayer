/**
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

/**
 * @class SharedBufferWorkletProcessor
 * @extends AudioWorkletProcessor
 */
class SharedBufferWorkletProcessor extends AudioWorkletProcessor {

    // Indices for the State SAB.
    STATE: any = {
        // Flag for Atomics.wait() and notify().
        'REQUEST_RENDER': 0,

        // Available frames in Input SAB.
        'IB_FRAMES_AVAILABLE': 1,

        // Read index of Input SAB.
        'IB_READ_INDEX': 2,

        // Write index of Input SAB.
        'IB_WRITE_INDEX': 3,

        // Available frames in Output SAB.
        'OB_FRAMES_AVAILABLE': 4,

        // Read index of Output SAB.
        'OB_READ_INDEX': 5,

        // Write index of Output SAB.
        'OB_WRITE_INDEX': 6,

        // Size of Input and Output SAB.
        'RING_BUFFER_LENGTH': 7,

        // Size of user-supplied processing callback.
        'KERNEL_LENGTH': 8,
    };


    _initialized: Boolean

    private _states!: Int32Array
    private _kernelLength!: number
    private _ringBufferLength!: number
    private _inputRingBuffer!: Float32Array[]
    private _outputRingBuffer!: Float32Array[]
    /**
     * @constructor
     * @param {AudioWorkletNodeOptions} nodeOptions
     */
    constructor(nodeOptions: AudioWorkletNodeOptions) {
        super();

        this._initialized = false;
        this.port.onmessage = this._initializeOnEvent.bind(this);
    }

    /**
     * Without a proper coordination with the worker backend, this processor
     * cannot function. This initializes upon the event from the worker backend.
     *
     * @param {Event} eventFromWorker
     */
    _initializeOnEvent(eventFromWorker: MessageEvent) {
        const sharedBuffers = eventFromWorker.data;

        // Get the states buffer.
        this._states = new Int32Array(sharedBuffers.states);

        // Worker's input/output buffers. This example only handles mono channel
        // for both.
        this._inputRingBuffer = [new Float32Array(sharedBuffers.inputRingBuffer)];
        this._outputRingBuffer = [new Float32Array(sharedBuffers.outputRingBuffer)];

        this._ringBufferLength = this._states[this.STATE.RING_BUFFER_LENGTH];
        this._kernelLength = this._states[this.STATE.KERNEL_LENGTH];

        this._initialized = true;
        this.port.postMessage({
            message: 'PROCESSOR_READY',
        });
    }

    /**
     * Push 128 samples to the shared input buffer.
     *
     * @param {Float32Array} inputChannelData The input data.
     */
    _pushInputChannelData(inputChannelData: Float32Array) {
        const inputWriteIndex = this._states[this.STATE.IB_WRITE_INDEX];

        if (inputWriteIndex + inputChannelData.length < this._ringBufferLength) {
            // If the ring buffer has enough space to push the input.
            this._inputRingBuffer[0].set(inputChannelData, inputWriteIndex);
            this._states[this.STATE.IB_WRITE_INDEX] += inputChannelData.length;
        } else {
            // When the ring buffer does not have enough space so the index needs to
            // be wrapped around.
            const splitIndex = this._ringBufferLength - inputWriteIndex;
            const firstHalf = inputChannelData.subarray(0, splitIndex);
            const secondHalf = inputChannelData.subarray(splitIndex);
            this._inputRingBuffer[0].set(firstHalf, inputWriteIndex);
            this._inputRingBuffer[0].set(secondHalf);
            this._states[this.STATE.IB_WRITE_INDEX] = secondHalf.length;
        }

        // Update the number of available frames in the input ring buffer.
        this._states[this.STATE.IB_FRAMES_AVAILABLE] += inputChannelData.length;
    }

    /**
     * Pull the data out of the shared input buffer to fill |outputChannelData|
     * (128-frames).
     *
     * @param {Float32Array} outputChannelData The output array to be filled.
     */
    _pullOutputChannelData(outputChannelData: Float32Array) {
        const outputReadIndex = this._states[this.STATE.OB_READ_INDEX];
        const nextReadIndex = outputReadIndex + outputChannelData.length;

        if (nextReadIndex < this._ringBufferLength) {
            outputChannelData.set(
                this._outputRingBuffer[0].subarray(outputReadIndex, nextReadIndex));
            this._states[this.STATE.OB_READ_INDEX] += outputChannelData.length;
        } else {
            const overflow = nextReadIndex - this._ringBufferLength;
            const firstHalf = this._outputRingBuffer[0].subarray(outputReadIndex);
            const secondHalf = this._outputRingBuffer[0].subarray(0, overflow);
            outputChannelData.set(firstHalf);
            outputChannelData.set(secondHalf, firstHalf.length);
            this._states[this.STATE.OB_READ_INDEX] = secondHalf.length;
        }
    }

    /**
     * AWP's process callback.
     *
     * @param {Array} inputs Input audio data.
     * @param {Array} outputs Output audio data.
     * @return {Boolean} Lifetime flag.
     */
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
        if (!this._initialized) {
            return true;
        }

        // This example only handles mono channel.
        const inputChannelData: Float32Array = inputs[0][0];
        const outputChannelData: Float32Array = outputs[0][0];

        if (inputChannelData === undefined) {
            return true
        }

        this._pushInputChannelData(inputChannelData as Float32Array);
        this._pullOutputChannelData(outputChannelData as Float32Array);

        if (this._states[this.STATE.IB_FRAMES_AVAILABLE] >= this._kernelLength) {
            // Now we have enough frames to process. Wake up the worker.
            Atomics.notify(this._states, this.STATE.REQUEST_RENDER, 1);
        }

        return true;
    }
}

registerProcessor('shared-buffer-worklet-processor', SharedBufferWorkletProcessor)
