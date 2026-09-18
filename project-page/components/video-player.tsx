"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { publication } from "@/lib/publication";

export function VideoPlayer() {
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (playing) frame.current?.focus();
  }, [playing]);

  return (
    <div className="video-player">
      {playing ? (
        <iframe
          ref={frame}
          src={publication.videoEmbedUrl}
          title="EvoMaestro research video"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="video-poster"
          onClick={() => setPlaying(true)}
          aria-label="Play the EvoMaestro research video"
        >
          <Image
            src="/figures/interface.webp"
            alt=""
            width={3200}
            height={1381}
            sizes="(max-width: 1066px) 92vw, 960px"
            loading="eager"
          />
          <span className="video-shade" />
          <span className="video-poster-label">
            EVOMAESTRO <span>IN ACTION</span>
          </span>
          <span className="video-play">
            <Icon name="play" />
          </span>
          <span className="video-poster-caption">
            From understanding to intervention
          </span>
        </button>
      )}
    </div>
  );
}
