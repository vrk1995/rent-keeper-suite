import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useOnboarding } from "@/hooks/useOnboarding";

/**
 * Auto-starts a lightweight product tour for new users only.
 * Users can Skip or complete the tour; either way it never runs again.
 */
const ProductTour = ({ forceStart, onFinish }: { forceStart?: boolean; onFinish?: () => void }) => {
  const { loading, tourCompleted, tourSkipped, markTour } = useOnboarding();
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!forceStart && (tourCompleted || tourSkipped)) return;
    if (startedRef.current) return;
    startedRef.current = true;

    // Give the DOM time to render sidebar
    const t = window.setTimeout(() => {
      const d: Driver = driver({
        showProgress: true,
        allowClose: true,
        overlayOpacity: 0.7,
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Finish",
        popoverClass: "rentflow-tour",
        onDestroyStarted: () => {
          const active = d.getActiveIndex();
          const total = d.getConfig().steps?.length ?? 0;
          if (active !== undefined && active < total - 1) {
            markTour({ tour_skipped: true });
          } else {
            markTour({ tour_completed: true });
          }
          d.destroy();
          onFinish?.();
        },
        steps: [
          {
            popover: {
              title: "Welcome to RentFlow 👋",
              description:
                "A quick 60-second tour of the main areas. You can skip anytime — and re-open this tour from the Help chat in the bottom-right.",
            },
          },
          {
            element: '[data-tour="nav-properties"]',
            popover: {
              title: "1. Properties",
              description: "Start here. Add your buildings, floors and units.",
              side: "right",
            },
          },
          {
            element: '[data-tour="nav-tenants"]',
            popover: {
              title: "2. Tenants",
              description: "Add tenants and link them to units. Their monthly rent will auto-generate.",
              side: "right",
            },
          },
          {
            element: '[data-tour="nav-receipts"]',
            popover: {
              title: "3. Receipts",
              description: "Mark rent as paid here. Receipt PDFs are generated automatically.",
              side: "right",
            },
          },
          {
            element: '[data-tour="nav-invoices"]',
            popover: {
              title: "4. Invoices",
              description: "Auto-generated invoices with your prefix and financial-year numbering. Frozen once issued.",
              side: "right",
            },
          },
          {
            element: '[data-tour="nav-billing"]',
            popover: {
              title: "5. Billing (Bill From)",
              description: "Set up your company details, GSTIN, invoice prefix and bank info that appear on invoices.",
              side: "right",
            },
          },
          {
            element: '[data-tour="help-launcher"]',
            popover: {
              title: "Need help later?",
              description: "Click this button anytime for step-by-step guides on every feature.",
              side: "left",
            },
          },
        ],
      });

      d.drive();
    }, 400);

    return () => window.clearTimeout(t);
  }, [loading, tourCompleted, tourSkipped, forceStart, markTour, onFinish]);

  return null;
};

export default ProductTour;
