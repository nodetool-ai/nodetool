# Command provider adapters

Shared provider construction and model discovery for installed command features.
This library has no command registration or interactive terminal code. Chat and
model commands reuse it without depending on one another.

The WebSocket provider accepts a structural inference client. Its consumer owns
the WebSocket connection and event transport.
