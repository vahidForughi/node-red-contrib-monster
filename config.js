module.exports = function(RED) {
    function RemoteServerNode(n) {
        RED.nodes.createNode(this,n);
        this.name = n.name;
  	    this.region = n.region;
  	    this.endpoint = n.endpoint;
        this.projectId = n.projectId;
        this.proxyRequired = n.proxyRequired;
        this.proxy = n.proxy;
        this.accessKey = this.credentials.accessKey;
        this.secretKey = this.credentials.secretKey;
    }
    RED.nodes.registerType("monster config",RemoteServerNode,{credentials: {
         accessKey: {type:"text"},
         secretKey: {type:"password"}
     }});
}
