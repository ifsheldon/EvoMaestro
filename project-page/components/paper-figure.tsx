"use client";

import Image from "next/image";
import { type ReactNode, useId, useRef, useState } from "react";
import { Icon } from "@/components/icon";

type PaperFigureProps = {
  number: number;
  src: string;
  width: number;
  height: number;
  alt: string;
  label: string;
  children: ReactNode;
};

export function PaperFigure({
  number,
  src,
  width,
  height,
  alt,
  label,
  children,
}: PaperFigureProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);

  function openFigure() {
    dialog.current?.showModal();
    setIsOpen(true);
  }

  return (
    <figure className="paper-figure">
      <button
        type="button"
        className="figure-image"
        onClick={openFigure}
        aria-label={`View ${label} at full resolution`}
        aria-haspopup="dialog"
      >
        <Image
          src={src}
          width={width}
          height={height}
          alt={alt}
          sizes="(max-width: 760px) 94vw, (max-width: 1280px) 90vw, 1160px"
          loading="lazy"
        />
        <span className="figure-expand">
          <Icon name="expand" />
          <span>View full figure</span>
        </span>
      </button>
      <figcaption>
        <span className="figure-label">Figure {number}.</span>{" "}
        <span>{children}</span>
      </figcaption>
      <dialog
        ref={dialog}
        className="figure-lightbox"
        aria-labelledby={titleId}
        onClose={() => setIsOpen(false)}
      >
        <div className="figure-lightbox-panel">
          <div className="figure-lightbox-toolbar">
            <h2 id={titleId}>
              Figure {number}. {label}
            </h2>
            <button
              type="button"
              className="figure-lightbox-close"
              onClick={() => dialog.current?.close()}
              aria-label="Close figure"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="figure-lightbox-image">
            {isOpen && (
              <Image
                src={src}
                width={width}
                height={height}
                alt={alt}
                unoptimized
              />
            )}
          </div>
        </div>
        <button
          type="button"
          className="figure-lightbox-dismiss"
          tabIndex={-1}
          aria-label="Close figure overlay"
          onClick={() => dialog.current?.close()}
        />
      </dialog>
    </figure>
  );
}
