const fs=require("fs"), vm=require("vm"), assert=require("assert");
const root=__dirname+"/dist/";
const html=fs.readFileSync(root+"index.html","utf8");
class Element {
 constructor(tag="div"){this.tag=tag;this.children=[];this.value="";this.hidden=false;this.textContent="";this.dataset={};this.classList={toggle(){}};this.lookup={};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(){}
 querySelector(tag){return this.lookup[tag] ||= new Element(tag);}
 showModal(){this.open=true;}
 close(){this.open=false;}
 click(){return this.onclick?.();}
 set innerHTML(_){throw Error("Untrusted content must not be inserted as HTML");}
}
const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
const filters=[...html.matchAll(/data-filter="([^"]+)"/g)].map(m=>{const e=new Element("button");e.dataset.filter=m[1];return e;});
nodes.get("branch").value="main";nodes.get("stream").value="StdOut";
const storage=new Map();
const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
const document={documentElement:new Element("html"),hidden:false,getElementById(id){assert(nodes.has(id),"Missing HTML element "+id);return nodes.get(id);},createElement(tag){return new Element(tag);},querySelectorAll(){return filters;},addEventListener(){}};
let request;
const remote={schema_version:1,generated_at:new Date().toISOString(),user:"test",jobs:[{id:"1",name:"<untrusted job>",state:"RUNNING",cpus:4,nodes:1,gres:"gres/gpu:1",logs:{StdOut:{text:"<script>not executable</script>",status:"Output",path:"test.out"}}}]};
const context=vm.createContext({document,localStorage,Date,console,AbortSignal,setInterval(){},navigator:{clipboard:{writeText:async()=>{}}},fetch:async(url,options)=>{request={url,options};return {ok:true,text:async()=>JSON.stringify(remote)};}});
vm.runInContext(fs.readFileSync(root+"app.js","utf8"),context);
const el=id=>nodes.get(id);
(async()=>{
 assert.equal(document.documentElement.dataset.theme,"light");
 el("theme").click();assert.equal(document.documentElement.dataset.theme,"dark");assert.equal(storage.get("myq-theme"),"dark");
 el("theme").click();assert.equal(document.documentElement.dataset.theme,"light");
 assert.equal(el("status").textContent,"Not connected");
 el("demo").click();
 assert.equal(el("running").textContent,"2");assert.equal(el("cpus").textContent,"32");assert.equal(el("gpus").textContent,"3");
 assert.equal(el("jobs").children.length,4);
 el("jobs").children[0].click();assert(el("logs").textContent.includes("Checkpoint saved"));
 assert.equal(el("gpu-util").textContent,"97%");assert.equal(el("gpu-memory").textContent,"18.0 GiB");
 assert.equal(el("jobs").children[0].children[4].textContent,"97%");
 el("jobs").children[1].click();assert(el("logs").textContent.includes("Tracks processed"));
 filters.find(e=>e.dataset.filter==="pending").click();assert.equal(el("jobs").children.length,2);
 el("search").value="ablation";el("search").oninput();assert.equal(el("jobs").children.length,1);
 el("search").value="";filters[0].click();
 el("repo").value="example/private-data";el("token").value="test-only-token";
 el("connection").onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(new URL(request.url).hostname,"api.github.com");
 assert.equal(request.options.headers.Authorization,"Bearer test-only-token");
 assert.equal(el("token").value,"");
 assert.equal(el("running").textContent,"1");
 el("jobs").children[0].click();assert.equal(el("logs").textContent,"<script>not executable</script>");
 assert.equal(el("gpu-util").textContent,"—");assert.equal(el("gpu-memory").textContent,"—");
 assert.equal(el("jobs").children[0].children[4].textContent,"—");
 assert([...storage.keys()].every(key=>key==="myq-theme"));
 el("disconnect").click();assert.equal(el("status").textContent,"Not connected");
 assert.equal(el("empty").querySelector("h3").textContent,"No snapshot loaded");
 console.log("UI behavior checks passed: light/dark themes, peak GPU accounting, missing telemetry, demo, counts, job selection, streams, filters, search, private snapshot fetch, safe text rendering, disconnect.");
})().catch(error=>{console.error(error);process.exitCode=1;});
