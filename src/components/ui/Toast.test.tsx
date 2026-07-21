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

describe("Toast width", () => {
  it("is not capped at the old fixed 300px width class", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    const container = screen.getByText("Hello").closest(".toast-surface");
    expect(container?.className).not.toContain("w-75");
    expect(container?.className).toContain("max-w-[90vw]");
  });
});

describe("toast.promise", () => {
  function PromiseTrigger({ shouldResolve }: { shouldResolve: boolean }) {
    const { promise } = useToast();
    React.useEffect(() => {
      const p = shouldResolve ? Promise.resolve("done") : Promise.reject(new Error("boom"));
      promise(p, {
        loading: "Working...",
        success: (v) => `Success: ${v}`,
        error: "Failed",
      }).catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  it("shows loading then swaps to success in place on resolve", async () => {
    render(
      <ToastProvider>
        <PromiseTrigger shouldResolve={true} />
      </ToastProvider>
    );
    expect(await screen.findByText("Success: done")).toBeInTheDocument();
    expect(screen.queryByText("Working...")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Success: done|Working/).length).toBe(1);
  });

  it("shows loading then swaps to error in place on reject", async () => {
    render(
      <ToastProvider>
        <PromiseTrigger shouldResolve={false} />
      </ToastProvider>
    );
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("Working...")).not.toBeInTheDocument();
  });
});
