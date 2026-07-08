@echo off
REM Short wrapper for the attractiveness script generator (Windows).
REM Usage:
REM   gen                                  (interactive prompts)
REM   gen --config clients\acme.config.json
REM   gen --index my_index --app-id APPID
node "%~dp0generator\generate.js" %*
