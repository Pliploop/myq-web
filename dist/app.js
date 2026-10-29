"use strict";
const $ = id => document.getElementById(id);
const state = {snapshot:null, selected:null, filter:"all", connection:null, demo:false, fetching:false};
const demo = {schema_version:1,user:"researcher",generated_at:new Date().toISOString(),jobs:[
{id:"24531901",name:"representation-training",state:"RUNNING",partition:"gpu",elapsed:"06:42:18",limit:"2-00:00:00",nodes:1,reason:"gpu-node-04",cpus:24,memory:"180G",gres:"gres/gpu:2",gpu_usage:{util_peak_percent:97,memory_peak_bytes:19327352832,basis:"Slurm task high-water marks"},logs:{StdOut:{path:"logs/training.out",status:"Output",text:"[06:42:01] Epoch 12 · step 4800\n[06:42:07] train/loss = 0.1824\n[06:42:14] validation/loss = 0.2017\n[06:42:18] Checkpoint saved."}}},
{id:"24531902",name:"audio-feature-extraction",state:"RUNNING",partition:"gpu",elapsed:"01:18:33",limit:"12:00:00",nodes:1,reason:"gpu-node-07",cpus:8,memory:"64G",gres:"gres/gpu:1",gpu_usage:{util_peak_percent:86,memory_peak_bytes:12884901888,basis:"Slurm task high-water marks"},logs:{StdErr:{path:"logs/extract.err",status:"Output",text:"Extracting audio features\nTracks processed: 18,240 / 25,000\nEstimated remaining: 29 minutes"}}},
{id:"24532012",name:"evaluation-ablation",state:"PENDING",partition:"gpu",elapsed:"0:00",limit:"04:00:00",nodes:1,reason:"Priority",cpus:8,memory:"32G",gres:"gres/gpu:1",logs:{}},
{id:"24532014",name:"embedding-index",state:"PENDING",partition:"cpu",elapsed:"0:00",limit:"08:00:00",nodes:1,reason:"Resources",cpus:16,memory:"128G",gres:"N/A",logs:{}}
]};
function setTheme(theme){
 theme=theme==="dark"?"dark":"light";
 document.documentElement.dataset.theme=theme;
 text("theme",theme==="light"?"Dark":"Light");
 $("theme").setAttribute("aria-label","Use "+(theme==="light"?"dark":"light")+" theme");
 $("theme").setAttribute("aria-pressed",String(theme==="dark"));
 try{localStorage.setItem("myq-theme",theme);}catch{}
}
let savedTheme="light";
try{savedTheme=localStorage.getItem("myq-theme") || "light";}catch{}
setTheme(savedTheme);
$("theme").onclick=()=>setTheme(document.documentElement.dataset.theme==="light"?"dark":"light");
function hasMetric(value){return typeof value==="number" && Number.isFinite(value) && value>=0;}
function formatPeak(value){return hasMetric(value)?new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(value)+"%":"—";}
function gpuCount(job){return [...(job.gres||"").matchAll(/gpu(?::[^,():]+)*:(\d+)/g)].reduce((s,m)=>s+Number(m[1]),0)*(Number(job.nodes)||1);}
function text(id, value){$(id).textContent=String(value);}
function running(job){return ["RUNNING","COMPLETING"].includes(job.state);}
function group(job){return running(job)?"running":job.state==="LEFT_QUEUE"?"recent":"pending";}
function clearError(){$("error").hidden=true;}
function fail(error){$("error").hidden=false;text("error",error.message || error);}
function validate(data){
 if(data.schema_version!==1 || !Array.isArray(data.jobs) || !Number.isFinite(Date.parse(data.generated_at))) throw Error("This file is not a supported myq snapshot.");
 if(data.jobs.length>10000) throw Error("Snapshot has too many jobs.");
 return data;
}
function load(data,demoMode=false){state.snapshot=validate(data);state.demo=demoMode;clearError();render();}
function render(){
 const snapshot=state.snapshot,jobs=snapshot?.jobs || [],active=jobs.filter(running);
 text("running",snapshot?active.length:"—");text("pending",snapshot?jobs.filter(j=>j.state==="PENDING" || j.state==="CONFIGURING").length:"—");
 text("cpus",snapshot?active.reduce((n,j)=>n+(Number(j.cpus)||0),0):"—");
 text("gpus",snapshot?active.reduce((n,j)=>n+gpuCount(j),0):"—");
 text("count",jobs.length);text("subtitle",snapshot?snapshot.user+" / Jobs, resources and output.":"Jobs, resources and output.");
 const query=$("search").value.toLowerCase();
 const visible=jobs.filter(j=>(state.filter==="all" || group(j)===state.filter) && [j.id,j.name,j.partition,j.reason].join(" ").toLowerCase().includes(query));
 $("jobs").replaceChildren();
 for(const job of visible){
  const row=document.createElement("tr");row.classList.toggle("selected",job.id===state.selected);row.tabIndex=0;row.setAttribute("aria-label","View "+job.name);
  const name=document.createElement("td"),title=document.createElement("span"),id=document.createElement("code");
  title.textContent=job.name;id.textContent=job.id;name.append(title,id);row.append(name);
  for(const [field,kind] of [["state","state"],["partition",""],["elapsed",""],["gpu_peak",""],["reason",""]]){
   const cell=document.createElement("td");
   cell.textContent=field==="gpu_peak"?formatPeak(job.gpu_usage?.util_peak_percent):job[field] || "—";
   if(kind)cell.className="state "+group(job);
   if(field==="gpu_peak"){cell.className="gpu-cell"+(hasMetric(job.gpu_usage?.util_peak_percent)?" available":"");cell.title="Highest task GPU activity reported by Slurm; not a live reading.";}
   row.append(cell);
  }
  const choose=()=>{state.selected=job.id;$("stream").value=job.logs?.StdOut?.text?"StdOut":job.logs?.StdErr?.text?"StdErr":"StdOut";render();};
  row.onclick=choose;row.onkeydown=event=>{if(event.key==="Enter" || event.key===" "){event.preventDefault();choose();}};$("jobs").append(row);
 }
 $("empty").hidden=visible.length>0;
 if(!snapshot){$("empty").querySelector("h3").textContent="No snapshot loaded";$("empty").querySelector("p").textContent="Connect a GitHub snapshot or open a local file.";}
 if(snapshot){$("empty").querySelector("h3").textContent=jobs.length?"No matching jobs":"The queue is clear";$("empty").querySelector("p").textContent=jobs.length?"Try a different search or filter.":"This snapshot contains no queued jobs.";}
 renderDetail();updateAge();text("source",state.connection?"GitHub / "+state.connection.repo:state.demo?"Demo / illustrative data":"Local snapshot");
}
function renderDetail(){
 const job=state.snapshot?.jobs.find(j=>j.id===state.selected);
 $("detail-empty").hidden=Boolean(job);$("detail-body").hidden=!job;if(!job)return;
 text("detail-state",job.state.replaceAll("_"," "));text("detail-name",job.name);text("detail-id",job.id);$("metadata").replaceChildren();
 for(const [label,value] of [["Partition",job.partition],["Elapsed / limit",job.elapsed+" / "+job.limit],["CPU cores",job.cpus],["Memory request",job.memory],["GPU request",job.gres],["Node / reason",job.reason]]){
  const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=String(value || "—");$("metadata").append(dt,dd);
 }
 const usage=job.gpu_usage;
 $("gpu-usage").hidden=!(gpuCount(job)>0 || usage);
 text("gpu-util",formatPeak(usage?.util_peak_percent));
 text("gpu-memory",hasMetric(usage?.memory_peak_bytes)?(usage.memory_peak_bytes/1073741824).toFixed(1)+" GiB":"—");
 const available=hasMetric(usage?.util_peak_percent) || hasMetric(usage?.memory_peak_bytes);
 text("gpu-note",available?"Slurm task peaks · not live utilization."+(usage.util_peak_percent>100?" A task using multiple GPUs can exceed 100%.":""):job.state==="PENDING"?"Available after the job starts.":"Not reported in this snapshot.");
 const log=job.logs?.[$("stream").value];text("log-status",log?log.status+(log.path?" · "+log.path:""):job.log_notice || (job.state==="PENDING"?"Output will be captured once the job starts.":"No output captured for this stream."));
 text("logs",log?.text || "No log output in this snapshot.");$("logs").scrollTop=$("logs").scrollHeight;
}
function updateAge(){
 if(!state.snapshot){text("status","Not connected");$("status").className="pill";text("updated","No snapshot loaded");return;}
 const age=Math.max(0,Math.floor((Date.now()-Date.parse(state.snapshot.generated_at))/1000)),stale=age>600;
 text("status",state.demo?"Demo":stale?"Snapshot stale":"Snapshot");$("status").className="pill "+(stale?"stale":"fresh");
 text("updated",state.demo?"Illustrative snapshot":"Captured "+(age<60?age+"s":Math.floor(age/60)+"m")+" ago");
 $("updated").title=new Date(state.snapshot.generated_at).toLocaleString();
}
async function refresh(){
 if(state.fetching)return;if(!state.connection){if(state.snapshot)updateAge();else $("settings").showModal();return;}
 state.fetching=true;$("refresh").disabled=true;
 try{
  const c=state.connection,parts=c.repo.split("/").map(encodeURIComponent);
  const url="https://api.github.com/repos/"+parts.join("/")+"/contents/snapshot.json?ref="+encodeURIComponent(c.branch);
  const response=await fetch(url,{headers:{Accept:"application/vnd.github.raw+json",Authorization:"Bearer "+c.token},cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error("GitHub returned "+response.status+". Check repository, branch and token access.");
  const raw=await response.text();if(raw.length>2000000)throw Error("Snapshot is unexpectedly large.");load(JSON.parse(raw));
 }catch(error){fail(error);}finally{state.fetching=false;$("refresh").disabled=false;}
}
$("configure").onclick=()=>$("settings").showModal();$("close-settings").onclick=()=>$("settings").close();
$("connection").onsubmit=event=>{event.preventDefault();const repo=$("repo").value.trim();if(!/^[\w.-]+\/[\w.-]+$/.test(repo)){fail("Use a repository name in owner/repository format.");return;}
 state.connection={repo,branch:$("branch").value.trim(),token:$("token").value};$("token").value="";$("settings").close();refresh();};
$("disconnect").onclick=()=>{state.connection=null;state.snapshot=null;state.selected=null;state.demo=false;$("token").value="";$("settings").close();clearError();render();};
$("refresh").onclick=refresh;$("search").oninput=render;
document.querySelectorAll("[data-filter]").forEach(button=>button.onclick=()=>{state.filter=button.dataset.filter;document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===button));render();});
$("close-detail").onclick=()=>{state.selected=null;renderDetail();render();};
$("stream").onchange=renderDetail;$("copy").onclick=async()=>{try{await navigator.clipboard.writeText($("logs").textContent);}catch{fail("Clipboard unavailable. Select the log text to copy it.");}};
$("top-open-file").onclick=$("open-file").onclick=()=>$("file").click();$("file").onchange=async()=>{const file=$("file").files[0];if(!file)return;try{if(file.size>2000000)throw Error("Snapshot must be smaller than 2 MB.");state.connection=null;load(JSON.parse(await file.text()));}catch(error){fail(error);}finally{$("file").value="";}};
$("demo").onclick=()=>{state.connection=null;load(demo,true);};
document.addEventListener("keydown",event=>{if(event.key==="Escape" && !$("settings").open){state.selected=null;render();}});
setInterval(updateAge,10000);setInterval(()=>{if(state.connection && !document.hidden)refresh();},60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden && state.connection)refresh();});
render();
