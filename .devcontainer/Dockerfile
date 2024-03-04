ARG VARIANT="3.10"
FROM mcr.microsoft.com/vscode/devcontainers/python:${VARIANT}

RUN pip install poetry
ENV SHELL /bin/bash

# Use the non-root user to run the application
USER vscode
