import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.scss'
import { ipcRenderer } from "electron"

const video = document.getElementById('player') as HTMLVideoElement

let progressv = -1

video.addEventListener("timeupdate", (event) => {

  const per = Math.floor(100 * video.currentTime / video.duration)
  if (!isNaN(video.duration) && !isNaN(per) && (per === 100 || per - progressv >= 1 || per < progressv)) {
    progressv = per
    ipcRenderer.send("play-progress", per/100)
  }
})

ipcRenderer.on('play-action', (event, action) => {
  if (video.src !== '') {
    if (action === 1) {
      video.play()
    } else {
      video.pause()
    }
  }
})

ipcRenderer.on('file-selected', (event, {path}) => {
  const playpath = "play://" + path
  if (video.src !== encodeURI(playpath)) {
    video.src = encodeURI(playpath)
    const trackNodeList = document.getElementsByTagName("track")
    for (let node of trackNodeList) {
      video.removeChild(node)
    }
  }
})

ipcRenderer.on('subtitle-open', (event, {path}) => {
  const vttpath = encodeURI("play://" + path)
  const node = document.createElement("track")
  node.setAttribute("default", "on")
  node.setAttribute("kind", "captions")
  node.setAttribute("src", vttpath)
  video.appendChild(node)
})

window.addEventListener('contextmenu', () => {
  ipcRenderer.invoke('show-context-menu')
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
  </React.StrictMode>,
)

postMessage({ payload: 'removeLoading' }, '*')
