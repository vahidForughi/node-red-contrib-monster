/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {


    function MonsterUpload(n) {
        var request = require("request");
        var bodyParser = require("body-parser");
        var multer = require("multer");
        var cookieParser = require("cookie-parser");
        var getBody = require('raw-body');
        var cors = require('cors');
        var onHeaders = require('on-headers');
        var typer = require('content-type');
        var mediaTyper = require('media-typer');
        var isUtf8 = require('is-utf8');
        var hashSum = require("hash-sum");

        function rawBodyParser(req, res, next) {
            if (req.skipRawBodyParser) { next(); } // don't parse this if told to skip
            if (req._body) { return next(); }
            req.body = "";
            req._body = true;

            var isText = true;
            var checkUTF = false;

            if (req.headers['content-type']) {
                var contentType = typer.parse(req.headers['content-type'])
                if (contentType.type) {
                    var parsedType = mediaTyper.parse(contentType.type);
                    if (parsedType.type === "text") {
                        isText = true;
                    } else if (parsedType.subtype === "xml" || parsedType.suffix === "xml") {
                        isText = true;
                    } else if (parsedType.type !== "application") {
                        isText = false;
                    } else if ((parsedType.subtype !== "octet-stream")
                        && (parsedType.subtype !== "cbor")
                        && (parsedType.subtype !== "x-protobuf")) {
                        checkUTF = true;
                    } else {
                        // application/octet-stream or application/cbor
                        isText = false;
                    }

                }
            }

            getBody(req, {
                length: req.headers['content-length'],
                encoding: isText ? "utf8" : null
            }, function (err, buf) {
                if (err) { return next(err); }
                if (!isText && checkUTF && isUtf8(buf)) {
                    buf = buf.toString()
                }
                req.body = buf;
                next();
            });
        }

        var corsSetup = false;

        function createRequestWrapper(node,req) {
            // This misses a bunch of properties (eg headers). Before we use this function
            // need to ensure it captures everything documented by Express and HTTP modules.
            var wrapper = {
                _req: req
            };
            var toWrap = [
                "param",
                "get",
                "is",
                "acceptsCharset",
                "acceptsLanguage",
                "app",
                "baseUrl",
                "body",
                "cookies",
                "fresh",
                "hostname",
                "ip",
                "ips",
                "originalUrl",
                "params",
                "path",
                "protocol",
                "query",
                "route",
                "secure",
                "signedCookies",
                "stale",
                "subdomains",
                "xhr",
                "socket" // TODO: tidy this up
            ];
            toWrap.forEach(function(f) {
                if (typeof req[f] === "function") {
                    wrapper[f] = function() {
                        node.warn("monster-pipe-upload.errors.deprecated-call",{method:"msg.req."+f});
                        var result = req[f].apply(req,arguments);
                        if (result === req) {
                            return wrapper;
                        } else {
                            return result;
                        }
                    }
                } else {
                    wrapper[f] = req[f];
                }
            });


            return wrapper;
        }
        function createResponseWrapper(node,res) {
            var wrapper = {
                _res: res
            };
            var toWrap = [
                "append",
                "attachment",
                "cookie",
                "clearCookie",
                "download",
                "end",
                "format",
                "get",
                "json",
                "jsonp",
                "links",
                "location",
                "redirect",
                "render",
                "send",
                "sendfile",
                "sendFile",
                "sendStatus",
                "set",
                "status",
                "type",
                "vary"
            ];
            toWrap.forEach(function(f) {
                wrapper[f] = function() {
                    node.warn("monster-pipe-upload.errors.deprecated-call",{method:"msg.res."+f});
                    var result = res[f].apply(res,arguments);
                    if (result === res) {
                        return wrapper;
                    } else {
                        return result;
                    }
                }
            });
            return wrapper;
        }

        var corsHandler = function(req,res,next) { next(); }

        if (RED.settings.httpNodeCors) {
            corsHandler = cors(RED.settings.httpNodeCors);
            RED.httpNode.options("*",corsHandler);
        }


        RED.nodes.createNode(this,n);
        if (RED.settings.httpNodeRoot !== false) {


            // if (!n.urlPrefix) {
            //     this.warn("monster-pipe-upload.errors.missing-path");
            //     return;
            // }
            
            if (!n.urlPrefix) {
                this.url = ""
            }
            else {
                this.url = n.urlPrefix
                if (this.url[0] !== '/') {
                    this.url = '/'+this.url;
                }
            }
            this.url += "/:container/:object"
            this.method = "put";
            this.upload = true;
            this.monsterConfig = RED.nodes.getNode(n.monster);
            var node = this;

            this.errorHandler = function(err,req,res,next) {
                node.warn(err);
                res.sendStatus(500);
            };


            const config = {
                endpoint: node.monsterConfig.endpoint,
                projectId: node.monsterConfig.projectId,
                accessKey: node.monsterConfig.accessKey,
                secretKey: node.monsterConfig.secretKey,
            }
            const publicURL= config.endpoint+"/v1/AUTH_test"
            let token = null;
            let serverError = null;

            function getToken(cfg) {
                // node.status({fill:"yellow",shape:"dot",text:"authenticating"});
                request({
                    url: cfg.endpoint+'/auth/v1.0/',
                    method: 'GET',
                    headers: {
                        "X-Storage-User": cfg.projectId + ':' + cfg.accessKey,
                        "X-Storage-Pass": cfg.secretKey
                    }
                }, (error, response, body) => {
                    // node.send([null, {point: "getToken",error: error, response: response, body: body}]);
                    if (response && response.statusCode === 200) {
                        token = response.headers["x-auth-token"]
                        // node.status({fill:"green",shape:"dot",text:"authenticate"});
                    }
                    else{
                        serverError = error
                        // node.status({fill:"red",shape:"dot",text:"unAuthenticate"});
                        // setTimeout(()=>{ getToken() },5000)
                    }
                });
            }
            getToken(config)

            this.callback = async function(req,res) {
                var msgid = RED.util.generateId();
                if (!token) { await getToken(config) }

                if (!token) {
                    node.send([null, {_msgid:msgid,req:req,res: createResponseWrapper(node, res),payload:{statusCode: 401, error: serverError}}]);
                }
                else {
                    const container = req.params.container
                    const object = req.params.object

                    var pipe = req.pipe(request({
                        url: config.endpoint + "/v1/AUTH_test" + "/" + container + "/" + object,
                        method: 'PUT',
                        headers: {
                            "Content-Type": "text/html; charset=UTF-8",
                            "X-Auth-Token": token
                        }
                    }));
                    pipe.on('error', (err) => {
                        node.send([null, {_msgid:msgid,payload:err, statusCode: 500, req:req, res: createResponseWrapper(node, res)}]);
                    })
                    pipe.on('end', () => {
                        res._msgid = msgid;
                        if (pipe.response && (pipe.response.statusCode === 200 || pipe.response.statusCode === 201 || pipe.response.statusCode === 203 || pipe.response.statusCode === 204)) {
                            node.send([{_msgid: msgid,req: req,res: createResponseWrapper(node, res),payload: {...pipe.response, container: container, object: object}}, null]);
                        }else {
                            node.send([null, {_msgid:msgid,req:req,payload:pipe.response}]);
                        }
                    })
                }
            };

            var httpMiddleware = function(req,res,next) { next(); }

            if (RED.settings.httpNodeMiddleware) {
                if (typeof RED.settings.httpNodeMiddleware === "function" || Array.isArray(RED.settings.httpNodeMiddleware)) {
                    httpMiddleware = RED.settings.httpNodeMiddleware;
                }
            }

            var maxApiRequestSize = RED.settings.apiMaxLength || '5mb';
            var jsonParser = bodyParser.json({limit:maxApiRequestSize});
            var urlencParser = bodyParser.urlencoded({limit:maxApiRequestSize,extended:true});

            var metricsHandler = function(req,res,next) { next(); }
            if (this.metric()) {
                metricsHandler = function(req, res, next) {
                    var startAt = process.hrtime();
                    onHeaders(res, function() {
                        if (res._msgid) {
                            var diff = process.hrtime(startAt);
                            var ms = diff[0] * 1e3 + diff[1] * 1e-6;
                            var metricResponseTime = ms.toFixed(3);
                            var metricContentLength = res.getHeader("content-length");
                            //assuming that _id has been set for res._metrics in HttpOut node!
                            node.metric("response.time.millis", {_msgid:res._msgid} , metricResponseTime);
                            node.metric("response.content-length.bytes", {_msgid:res._msgid} , metricContentLength);
                        }
                    });
                    next();
                };
            }

            var multipartParser = function(req,res,next) { next(); }
            if (this.upload) {
                var mp = multer({ storage: multer.memoryStorage() }).any();
                multipartParser = function(req,res,next) {
                    mp(req,res,function(err) {
                        req._body = true;
                        next(err);
                    })
                };
            }

            if (this.method == "put") {
                // RED.httpNode.post(this.url,cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,multipartParser,rawBodyParser,this.callback,this.errorHandler);
                RED.httpNode.put(this.url,cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,this.callback,this.errorHandler);
            }

            this.on("close",function() {
                var node = this;
                RED.httpNode._router.stack.forEach(function(route,i,routes) {
                    if (route.route && route.route.path === node.url && route.route.methods[node.method]) {
                        routes.splice(i,1);
                    }
                });
            });
        } else {
            this.warn("monster-pipe-upload.errors.not-created");
        }
    }

    RED.nodes.registerType("monster upload",MonsterUpload);

}
