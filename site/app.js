import {chart,roleTable} from './render.js'
const status=document.querySelector('#status')
try {
 const response=await fetch('report-data.json')
 if(!response.ok)throw new Error(`HTTP ${response.status}`)
 const data=await response.json()
 const dataset=document.querySelector('#dataset'),metric=document.querySelector('#metric')
 const render=()=>{
  const selected=data.datasets[dataset.value]
  document.querySelector('#chart').innerHTML=chart(selected,metric.value)
  document.querySelector('#roles').innerHTML=roleTable(selected,['pss','uss','rss'].includes(metric.value)?metric.value:'pss')
  status.textContent=`Captured ${selected.capturedAt}. ${selected.protocol.repeats} fresh runs per application. Role attribution uses ${['pss','uss','rss'].includes(metric.value)?metric.value.toUpperCase():'PSS; cgroup charges have no per-process breakdown'}.`
 }
 dataset.addEventListener('change',render);metric.addEventListener('change',render);render()
} catch(error) {status.textContent=`Interactive controls unavailable: ${error.message}. The generated tables remain readable.`}
