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


    function SwiftProxy(n) {
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
                        node.warn("monster-swift-proxy.errors.deprecated-call",{method:"msg.req."+f});
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
                    node.warn("monster-swift-proxy.errors.deprecated-call",{method:"msg.res."+f});
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

            const routes = {
                auth: {method: "GET" ,path: "/auth/v1.0/"},
                info: {method: "GET" ,path: "/info"},
                ContainerList: {method: "GET" ,path: "/v1/:account"},
                ContainerCreate: {method: "PUT" ,path: "/v1/:account/:container"},
                ContainerMetaUpdate: {method: "POST" ,path: "/v1/:account/:container"},
                ContainerDelete: {method: "DELETE" ,path: "/v1/:account/:container"},
                ObjectList: {method: "GET" ,path: "/v1/:account/:container"},
                ObjectGet: {method: "GET" ,path: "/v1/:account/:container/:object"},
                ObjectCreate: {method: "PUT" ,path: "/v1/:account/:container/:object"},
                ObjectCopy: {method: "COPY" ,path: "/v1/:account/:container/:object"},
                ObjectMetaUpdate: {method: "POST" ,path: "/v1/:account/:container/:object"},
                ObjectDelete: {method: "DELETE" ,path: "/v1/:account/:container/:object"}
            }

            // if (!n.urlPrefix) {
            //     this.warn("monster-swift-proxy.errors.missing-path");
            //     return;
            // }

            // this.urlPrefix = n.urlPrefix;
            // if (this.urlPrefix.substr(0,1) != "/") {
            //     this.urlPrefix = "/"+this.urlPrefix;
            // }
            if (!n.urlPrefix) {
                this.urlPrefix = ""
            }
            else {
                this.urlPrefix = n.urlPrefix
                if (this.urlPrefix[0] !== '/') {
                    this.urlPrefix = '/'+this.urlPrefix;
                }
            }
            this.url += "/:container/:object"
            this.monsterEndpoint = n.monsterEndpoint;
            if(this.monsterEndpoint.substr(this.monsterEndpoint.length - 1) == "/") {
                this.monsterEndpoint.slice(0, -1);
            }
            var node = this;

            this.errorHandler = function(err,req,res,next) {
                node.warn(err);
                res.sendStatus(500);
            };


            this.callback = function(req,res) {
                var msgid = RED.util.generateId();

                let url = req.url.substr(node.urlPrefix.length, req.url.length);
                if (url.substr(0,1) != "/") { url = "/"+ url; }
                url = node.monsterEndpoint + url;
                // node.warn({url: url, reqUrl: req.url, reqUrlWithout: req.url.substr(node.urlPrefix.length, req.url.length)});
                const method = req.method;
                node.method = method
                // const body = req.body
                //parse rawHeaders
                const rawHeaders = req.rawHeaders
                var headers = {};
                rawHeaders.forEach(h => {
                    for(var i=0; i<rawHeaders.length; i+=2) {
                        headers[rawHeaders[i]] = rawHeaders[i+1]
                    }
                });
                
                Object.filter = (obj, predicate) => Object.fromEntries(Object.entries(obj).filter(predicate));
                const type = Object.keys((Object.filter(routes, ([key, route]) => route.path == req.route.path && route.method == req.method)))[0];
                res._msgid = msgid;

                var str = "";
                var pipe = req.pipe(request({
                    url: url,
                    method: method,
                    headers: headers
                }));
                pipe.on('error', (err) => {
                    const message = {_msgid: msgid, type: type, payload: err, statusCode: 500, req: req,res: createResponseWrapper(node, res)} 
                    node.send([null, message]);
                })
                pipe.on('data', (data) => {
                    str += data
                })
                pipe.on('end', () => {
                    const message = {_msgid: msgid, type: type, payload: str, statusCode: pipe.response.statusCode, headers: pipe.response.headers, req: req,res: createResponseWrapper(node, res)} 
                    if ([200,201,202,203,204].includes(pipe.response.statusCode))
                        node.send([message, null]);
                    else
                        node.send([null, message]);
                })
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


            RED.httpNode.get(this.urlPrefix+"/auth/v1.0/",cookieParser(),httpMiddleware,corsHandler,metricsHandler,this.callback,this.errorHandler);
            RED.httpNode.get(this.urlPrefix+"/info",cookieParser(),httpMiddleware,corsHandler,metricsHandler,this.callback,this.errorHandler);
            RED.httpNode.get(this.urlPrefix+"/v1/:account",cookieParser(),httpMiddleware,corsHandler,metricsHandler,this.callback,this.errorHandler);
            RED.httpNode.get(this.urlPrefix+"/v1/:account/:container",cookieParser(),httpMiddleware,corsHandler,metricsHandler,this.callback,this.errorHandler);
            RED.httpNode.get(this.urlPrefix+"/v1/:account/:container/:object",cookieParser(),httpMiddleware,corsHandler,metricsHandler,this.callback,this.errorHandler);
            RED.httpNode.post(this.urlPrefix+"/v1/:account/:container",cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,this.callback,this.errorHandler);
            RED.httpNode.post(this.urlPrefix+"/v1/:account/:container/:object",cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,this.callback,this.errorHandler);
            RED.httpNode.put(this.urlPrefix+"/v1/:account/:container",cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,this.callback,this.errorHandler);
            RED.httpNode.put(this.urlPrefix+"/v1/:account/:container/:object",cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,this.callback,this.errorHandler);
            RED.httpNode.copy(this.urlPrefix+"/v1/:account/:container/:object",cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,this.callback,this.errorHandler);
            RED.httpNode.delete(this.urlPrefix+"/v1/:account/:container",cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,this.callback,this.errorHandler);
            RED.httpNode.delete(this.urlPrefix+"/v1/:account/:container/:object",cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,this.callback,this.errorHandler);

            this.on("close",function() {
                var node = this;
                RED.httpNode._router.stack.forEach(function(route,i,routes) {
                    if (route.route && route.route.path === node.urlPrefix && route.route.methods[node.method]) {
                        routes.splice(i,1);
                    }
                });
            });
        } else {
            this.warn("monster-swift-proxy.errors.not-created");
        }
    }

    RED.nodes.registerType("swift proxy",SwiftProxy);

}
