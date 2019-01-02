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
                    let merg3d = clients ? clients.find(f => { return f.name == "Merg3d"})[0] : null;
                    
                    if(merg3d){
                    // Get projects under Merg3d client
                        repo.GetClientProjects(merg3d.id, (projects) => {
                            
                            // Filter out those Merg3d projects' time entries 
                            time_entries = time_entries.filter(t => { return projects.map(p => p.id).indexOf(t.pid) == -1 })

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
                console.log("ADDED: " + json.data.description + "; Tags: " + json.data.tags.join(','))
            })

            res.on("error", (msg) => {
                console.log("ERROR ADDING JIRA TAG TO: " + id.toString())
            })
        })

        req.write(`{"time_entry":{"tags":["JIRA"]}}`)
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

    return repo;
}
