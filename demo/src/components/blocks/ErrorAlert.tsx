"use client";
import React from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function ErrorAlert({ message, title = "Error" }: { message: string; title?: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
