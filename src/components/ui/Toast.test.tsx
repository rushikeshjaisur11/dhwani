import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { useToast } from "./useToast";

import * as React from "react";

function Trigger({ variant }: { variant?: "default" | "destructive" | "success" }) {
  const { toast } = useToast();
  React.useEffect(() => {
    toast({ title: "Hello", variant });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe("Toast variant icons", () => {
  it("renders an icon svg for the success variant", () => {
    render(
      <ToastProvider>
        <Trigger variant="success" />
      </ToastProvider>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    const container = screen.getByText("Hello").closest(".toast-surface");
    expect(container?.querySelector("svg")).toBeTruthy();
  });

  it("renders default variant with an icon when no variant is passed", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    const container = screen.getByText("Hello").closest(".toast-surface");
    expect(container?.querySelector("svg")).toBeTruthy();
  });
});
