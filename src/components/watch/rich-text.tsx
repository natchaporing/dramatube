"use client";

import { Fragment } from "react";
import { seekPlayer } from "./player";

const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]}])|(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/g;

function seconds(stamp: string): number {
  return stamp.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * Plain text with links made clickable and timestamps that seek the player.
 * Nothing is rendered as HTML: every piece is a text node or an element
 * built here, so a comment cannot inject markup.
 */
export function RichText({ text, seekable = true }: { text: string; seekable?: boolean }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const [token, url, stamp] = match;
    if (url) {
      parts.push(
        <a key={index} href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-[#8ab4ff] hover:underline">
          {url}
        </a>,
      );
    } else if (stamp && seekable) {
      parts.push(
        <button key={index} type="button" onClick={() => seekPlayer(seconds(stamp))} className="text-[#8ab4ff] hover:underline">
          {stamp}
        </button>,
      );
    } else {
      parts.push(token);
    }
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}
