import React from 'react'
import './index.scss'
import 'video.js/dist/video-js.css'
import videojs from 'video.js'
// import 'videojs-overlay-buttons'
declare type Player = ReturnType<typeof videojs>


interface AppProps {
    options: any;
    onReady: (player: any) => void;
}

const App: React.FC<AppProps> = (props) => {

    const videoRef = React.useRef<HTMLDivElement>(null);
    const playerRef = React.useRef<Player|null>(null);
    const { options, onReady } = props;

    React.useEffect(() => {
        if (!playerRef.current) {
            const videoElement = document.createElement("video-js")
            videoElement.classList.add("vjs-big-play-centered")
            videoRef.current?.appendChild(videoElement)

            const player = videojs(videoElement, options, () => {
                if (onReady) { 
                    onReady(player);
                }
            });
            playerRef.current = player
        } else {

            const player = playerRef.current;

            player.autoplay(videojs.options.autoplay);
            player.src(videojs.options.sources);
        }

    }, [options, videoRef])

    React.useEffect(() => {
        const player = playerRef.current;

        return () => {
            if (player && !player.isDisposed()) {
                player.dispose();
                playerRef.current = null;
            }
        };
    }, [playerRef])

    return (
        <div data-vjs-player>
            <div ref={videoRef}></div>
        </div>
    )
}

export default App