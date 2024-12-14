# nodetool.common.environment

## Environment

A class that manages environment variables and provides default values and type conversions.
This class acts as a central place to manage environment variables and settings for the application.
It provides methods to retrieve and set various configuration values, such as AWS credentials, API keys,
database paths, and more.

Settings and Secrets:
The class supports loading and saving settings and secrets from/to YAML files. The settings file
(`settings.yaml`) stores general configuration options, while the secrets file (`secrets.yaml`)
stores sensitive information like API keys.

Local Mode:
In local mode (non-production environment), the class uses default values or prompts the user for
input during the setup process. It also supports local file storage and SQLite database for
development purposes.

**Tags:** 

