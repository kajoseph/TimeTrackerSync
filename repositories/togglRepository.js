'use strict'

var https = require("https");

module.exports = (config) => {
    var repo = {};

    repo.GetTimeEntries = (startTime, endTime, callback) => {
        var self = this;
        let options = {
            "hostname": config.baseUrl,
            "path": config.path + `?start_date=${encodeURIComponent(startTime)}&end_date=${encodeURIComponent(endTime)}`,
            "method": "GET",
            "auth": `${config.userName}:${config.password}`
        };

        var req = https.request(options, res => {
            var chunks = [];

            res.on("data", function (chunk) {
                chunks.push(chunk);
            });

            res.on("end", function () {
                var time_entries = JSON.parse((Buffer.concat(chunks)).toString());
                
                // Get all clients
                repo.GetClients((clients) => {
                    // Get client id of Merg3d
                    let merg3d = clients ? clients.find(f => { return f.name == "Merg3d"}) : null;
                    
                    if(merg3d){
                    // Get projects under Merg3d client
                        repo.GetClientProjects(merg3d.id, (projects) => {
                            
                            // Filter out those Merg3d projects' time entries 
                            time_entries = time_entries.filter(t => { return projects.map(p => p.id).indexOf(t.pid) == -1 })

                            // Filter out previously recorded time entries and blank descriptions and duration is greater than 0 (i.e. not currently running time)
                            time_entries = time_entries.filter(f => { return (!f.tags || f.tags.indexOf("JIRA")) && f.description && f.duration > 0})
                            
                            // callback = enter the time entries (Devnext only) into JIRA.
                            callback(time_entries)
                        })
                    }
                    else{
                        callback(time_entries)
                    }
                })
            });

            res.on("error", (msg) => {
                console.log(msg);
            })
        });

        req.end();
    }

    repo.MarkJira = (id) => {
        let options = {
            "hostname": config.baseUrl,
            "path": config.path + `/${id}`,
            "method": "PUT",
            "auth": `${config.userName}:${config.password}`
        };

        let req = https.request(options,(res) => {
            let chunks = [];

            res.on("data", (chunk) => {
                chunks.push(chunk);
            });

            res.on("end", () => {
                var body = Buffer.concat(chunks);
                var json = JSON.parse(body.toString())
                json.data = Array.isArray(json.data) ? json.data[0] : json.data;
                console.log("ADDED: " + json.data.description + "; Tags: " + json.data.tags.join(','))
            })

            res.on("error", (msg) => {
                console.log("ERROR ADDING JIRA TAG TO: " + id.toString())
            })
        })

        req.write(`{"time_entry":{"tags":["JIRA"], "tag_action": "add"}}`)
        req.end();
    }

    repo.GetClients = (callback) => {
        let options = {
            "hostname": config.baseUrl,
            "path": "/api/v8/clients",
            "method": "GET",
            "auth": `${config.userName}:${config.password}`
        }

        let chunks = [];
        var req = https.request(options, res => {
            res.on("data", chunk => {
                chunks.push(chunk);
            })

            res.on("end", () => {
                let clients = JSON.parse((Buffer.concat(chunks)).toString());
                callback(clients);
            })

            res.on("error", msg => {
                console.log("ERROR getting Clients from Toggl: " + msg);
            })
        })

        req.end();
    }

    repo.GetClientProjects = (clientId, callback) => {
        let options = {
            "hostname": config.baseUrl,
            "path": `/api/v8/clients/${clientId}/projects`,
            "method": "GET",
            "auth": `${config.userName}:${config.password}`
        }

        let chunks = [];
        var req = https.request(options, res => {
            res.on("data", chunk => {
                chunks.push(chunk);
            })

            res.on("end", () => {
                let projects = JSON.parse((Buffer.concat(chunks)).toString());

                callback(projects);
            })

            res.on("error", msg => {
                console.log("ERROR getting Projects for Client " + clientId.toString() + " from Toggl: " + msg);
            })
        })

        req.end();
    }

    /**
     * Prevents multiple time entries per day being entered into JIRA due to Toggl
     * creating new time entry records every time the timer starts.
     * @param data Time entry data from Toggl
     * @returns {array} Array of objects, each object includes a "raw" property which is an array of uncompressed objects
     */
    repo.CompressTimeEntriesToDay = (data) => {
       
        // Compress the data into one entry per day per US.
        // res is return object from reduce loop
        // value is the i-th object in array loop
        return data.reduce((res,value) => {
            // Check if res already has object that has record for US and day
            var r = res.find(f => f.storyId == value.description.split(" ")[0].trim() && f.start == (new Date(value.start)).toDateString() );
            if(r){
                var i = res.indexOf(r);
                res[i].duration += value.duration;
                res[i].id += "," + value.id.toString();
                res[i].jiraDescription.push(value.description);
                res[i].raw.push(value);
            }
            else {
                res.push({
                    storyId: value.description.split(" ")[0].trim(),
                    description: value.description + "(" + (new Date(value.start)).toDateString() + ")",
                    jiraDescription: [value.description], // This will be stringified for logging into JIRA. Just in case there's a mis-named time log that gets included.
                    start: (new Date(value.start)).toDateString(),
                    duration: value.duration,
                    id: value.id.toString(), // Toggl allows bulk tag updates via comma separated ids.
                    raw: [value]
                });
            };
            return res; //Returns res to next iteration of loop. Gets compounded in reduce loop.
        },[])
    }

    return repo;
}
