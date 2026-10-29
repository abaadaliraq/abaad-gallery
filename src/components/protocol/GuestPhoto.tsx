"use client";
import Image, { type ImageLoaderProps } from "next/image";
// Browser requests our authorized proxy directly; never use the public Next image cache.
function authorizedPhotoLoader({ src, width }: ImageLoaderProps) {
  const size = [64, 96, 160, 320, 640].find((value) => value >= width) || 640;
  return src + (src.includes("?") ? "&" : "?") + "w=" + size;
}
import { memo, useState } from "react";
import { initials } from "@/lib/protocol/search";
import type { Guest, ProtocolMode } from "@/types/protocol";
import mobile from "./guest-mobile";
function GuestPhoto({
  guest,
  mode,
  large = false,
  compact = false,
  card = false,
}: {
  guest: Guest;
  mode: ProtocolMode;
  large?: boolean;
  compact?: boolean;
  card?: boolean;
}) {
  const [failed, setFailed] = useState("");
  const size = compact ? 40 : large ? 224 : card ? 192 : 96;
  const photoVersion = [
    guest.photo_public_id,
    guest.photo_url,
    guest.photo_gravity,
  ].join("|");
  const src =
    (mode === "admin" ? "/api/admin/guests/photo/" : "/api/protocol/photo/") +
    guest.id +
    "?v=" +
    encodeURIComponent(photoVersion);
  return (
    <span
      className={
        "flex shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-background text-accent " +
        (compact
          ? "h-10 w-10 text-xs"
          : large
            ? "h-56 w-56 text-3xl"
            : "h-14 w-14 text-base sm:h-24 sm:w-24") + (card ? " " + mobile.cardPhoto : "")
      }
    >
      {guest.photo_public_id && failed !== photoVersion ? (
        <Image
          src={src}
          alt={"صورة " + guest.full_name_ar}
          width={size}
          height={size}
          loader={authorizedPhotoLoader}
          sizes={
            compact ? "40px" : large ? "224px" : card ? "(min-width: 640px) 96px, (max-width: 380px) 140px, 180px" : "(min-width: 640px) 96px, 56px"
          }
          loading="lazy"
          onError={() => setFailed(photoVersion)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-label={"لا تتوفر صورة لـ " + guest.full_name_ar}>
          {initials(guest.full_name_ar)}
        </span>
      )}
    </span>
  );
}

export default memo(
  GuestPhoto,
  (a, b) =>
    a.mode === b.mode &&
    a.large === b.large &&
    a.compact === b.compact &&
    a.card === b.card &&
    a.guest.id === b.guest.id &&
    a.guest.full_name_ar === b.guest.full_name_ar &&
    a.guest.photo_public_id === b.guest.photo_public_id &&
    a.guest.photo_url === b.guest.photo_url &&
    a.guest.photo_gravity === b.guest.photo_gravity,
);
