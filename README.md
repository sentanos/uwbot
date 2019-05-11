# uwbot
A bot for the UW discord, mostly for anonymous chatting.

## Running with docker
The repository is automatically synced with a public docker repository. To use with docker, first 
pull the repository:
```bash
docker pull froast/uwbot
```
We need to have a location where the bot can store database files and read config files:
```bash
mkdir uwbot
cd uwbot
```
Create a `config.json` file in this folder using the editor of your choice. Refer to
[config.example.json](config.example.json) for the format and configuration variables.

Also create an `env.list` file that will contain environment variables passed to the bot. Refer 
to [env.example.list](env.example.list) for the format and required variables. Copy and paste 
your discord token to the file in the specified location. For running with docker, the 
configuration path and database path will be the same as in the example file. That is: 
`CONFIG_PATH=/external/config.json` and `DATABASE_PATH=/external/store.db`

To finally run the bot, run the following command (while still in the uwbot folder):
```bash
docker run -d \
--name uwbot \
--env-file env.list \
--mount type=bind,source=$(pwd),target=/external \
uwbot
```
