"use client";

import React from "react";
import { track, type PlausibleProps, type TrackEvent } from "../lib/analytics";

interface TrackedLinkProps extends Omit<React.ComponentPropsWithoutRef<"a">, "onClick"> {
  event: TrackEvent;
  eventProps: PlausibleProps;
}

export default function TrackedLink({ event, eventProps, ...props }: TrackedLinkProps): React.ReactElement {
  return <a {...props} onClick={() => track(event, eventProps)} />;
}
