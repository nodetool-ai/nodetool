# nodetool.nodes.nodetool.audio.conversion

## AudioToTensor

AudioToTensor node transforms an audio file into a tensor, a data structure that can be understood by machine learning algorithms.
This node is primarily useful for audio data pre-processing, as machine learning algorithms require data in a specific format (like tensors). The resultant tensor contains the raw audio samples ready for further processing. Some of the significant uses of this node are in voice recognition, sound classification, and other audio analysis tasks.

Applications:
- Transforming audio files for machine learning tasks.
- Converting audio into a manageable and processable format for further audio analysis.

**Tags:** 

**Inherits from:** BaseNode

- **audio**: The audio file to convert to a tensor. (`AudioRef`)

## TensorToAudio

This node converts a numerical tensor object to an audio file.
A tensor is a mathematical object analogous to but more general than a vector, represented by an array of components that are functions of the coordinates of a space. In this case, it represents the audio data. This node takes such tensor data and transforms it into an audio format.

The node is handy when dealing with audio data or signals that have been transformed into tensor format for machine learning models or signal processing. The node allows you to convert the tensor back to an audio file. This is particularly essential when you need to listen to the model output or the processed signals.

Applications:
- Reverse the output of machine learning models that generate tensor audio data back to an audiofile.
- Retrieve and listen to the audio signal after audio signal processing done on tensor format.

**Tags:** 

**Inherits from:** BaseNode

- **tensor**: The tensor to convert to an audio file. (`Tensor`)
- **sample_rate**: The sample rate of the audio file. (`int`)

