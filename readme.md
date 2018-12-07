# Overall Requirements
## Node JS Environment
* Latest NodeJS runtime environment should suffice
* Latest NPM executables
## Target Process Account
* The user's ID value in the Target Process system for syncing time to the user
## Jira Account
* The user's ID, user name (typically email without the domain), and API token in Jira for syncing time to the user
## Harvest Account
* The user's User ID value in the Harvest system for pulling time data
* A project task called 'Completed' to move all of the time entries to after the time has been pushed up to TP

# Installation
Once the repository has been cloned, run ```npm install``` to download the dependencies.  See ```package.json``` for the current list of dependencies.

# Configuration
Configuration is handled by the ```config.json``` file on the root path.  The configuration file should follow the template layout.
```json
{ 
    "testMode": true,
    "targetProcess": {
        "baseUrl": "base URL for account",
        "userName": "user email address",
        "password": "user password",
        // the following settings are required in the config file
        "userId": 0
    },
    "harvest": {
        "baseUrl": "base URL for account",
        "userName": "user email address",
        "password": "user password",
        // the following settings are required in the config file
        "userId": 0,
        "completedTaskId": 1000000
    },
    "jira": {
        "baseUrl": "base url for jira account",
        "userId": "login user name",        
        "apiToken": "API token provided from jira",
        // the following settings are required in the config file
        "userName": "user name"
    }
}
```

There is a config template file at the root level for convenience when setting up a new user.

## Configuration in Environment Variables as Defaults
The URLs, user names, and passwords can all be configured as environment variables as well and omitted from the config.json file.  The config file is checked first and will fallback to the environment variable if the setting is not found.  The name of the environment variable follows the format [SECTION NAME]_[PROPERTY NAME] (ie, targetProcess.baseUrl defaults to TARGETPROCESS_BASEURL).

### Mac OS X Setting Up Environment Variables
* In a terminal window, navigate to the home directory (```cd ~```) and run ```nano .profile``` to create a new or open the existing .profile file
* Add export statements for the environment variables, ie ```export TARGETPROCESS_BASEURL=example.tpondemand.com```
* When all of the environment variables have been added, save the file and close the nano editor
* **NOTE** The environment variables will not be updated until the next time you start the terminal window

# Executing the Sync
At a command line, navigate to the project folder and run ```node app.js``` to start the sync.  The sync will start and run to completion with any error messages printed back to the console.

# Tracking and Updating Time
The sync process uses the time associated with the timer as the time spent on the entity.  To map the entity back to the entity/issue tracking software the sync looks for a specific formatting in the task notes when determining where to add the time in the target application.  The following examples show the basic formats that the sync process will accept.

## Simple Time Update
```#32088: Personnel Address Book Changes```

The entity/issue here is ```32088``` so the amount of time on the timer will be added there.  The time remaining on the entity will decrement by the time spent.  If there is less time remaining than time spent, the time remaining will be set to zero.

## Time Update with Time Remaining
```#32088: Personnel Address Book Change (R:2.5)```

Again, the entity/issue here is ```32088``` so the amount of time on the timer will be added there.  In this case though, the time remaining on the entity will be set to 2.5 hours as the ```(R:<Hours Remaining>)``` has been specified in the note.  NOTE: The ```(R:<Hours Remaining>)``` must be the last non-whitespace characters on the line or it will not be added.

