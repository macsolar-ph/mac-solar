"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, Mail, Sun, Moon } from "lucide-react";
import Logo from "@/components/ui/Logo";
import AppliancesSection from "@/components/assessment/AppliancesSection";
import ElectricitySection from "@/components/assessment/ElectricitySection";
import LocationSection from "@/components/assessment/LocationSection";
import { submitAssessment, checkEmailAvailable } from "@/lib/actions";
import { validateEmail } from "@/lib/email-validator";
import { INITIAL_FORM_DATA } from "@/lib/types";
import type { AssessmentFormData } from "@/lib/types";

const STEPS = [
  { id: 1, label: "Appliances" },
  { id: 2, label: "Bill" },
  { id: 3, label: "Location" },
  { id: 4, label: "Email" },
  { id: 5, label: "Review" },
];

function countFilledAppliances(form: AssessmentFormData): number {
  const qtys = [
    // Lighting & Fans
    form.lights,
    form.fan,
    // Entertainment & Work
    form.tv,
    form.desktop,
    // Kitchen & Cooking
    form.ref,
    form.rice_cooker,
    form.induction_cooker,
    form.electric_oven,
    form.coffee_maker,
    form.water_dispenser,
    // Air Conditioner
    form.aircon.hp_0_5,
    form.aircon.hp_1,
    form.aircon.hp_1_5,
    form.aircon.hp_2,
    form.aircon.hp_2_5_plus,
    // Water Pump
    form.water_pump.hp_0_5,
    form.water_pump.hp_1,
    form.water_pump.hp_1_5,
    form.water_pump.hp_2,
    form.water_pump.hp_3_plus,
    // Personal Care & Utilities
    form.shower_heater,
    form.flat_iron,
  ];
  let count = qtys.filter((a) => a.day > 0 || a.night > 0).length;
  if (form.has_electric_car && form.electric_car_qty > 0) count++;
  count += form.other_appliances.filter(
    (a) => a.name.trim().length > 0 && (a.day > 0 || a.night > 0)
  ).length;
  return count;
}

function hasDuplicateOtherAppliances(form: AssessmentFormData): boolean {
  const names = form.other_appliances
    .map((a) => a.name.trim().toLowerCase())
    .filter((n) => n.length > 0);
  return names.length !== new Set(names).size;
}

function getApplianceSummary(form: AssessmentFormData) {
  const rows: { label: string; day: number; night: number; ev?: number }[] = [];

  const addQty = (label: string, qty: { day: number; night: number }) => {
    if (qty.day > 0 || qty.night > 0) {
      rows.push({ label, day: qty.day, night: qty.night });
    }
  };

  // Lighting & Fans
  addQty("Lights", form.lights);
  addQty("Electric Fan", form.fan);
  // Entertainment & Work
  addQty("Television", form.tv);
  addQty("Desktop Computer", form.desktop);
  // Kitchen & Cooking
  addQty("Refrigerator", form.ref);
  addQty("Rice Cooker", form.rice_cooker);
  addQty("Induction Cooker", form.induction_cooker);
  addQty("Electric Oven", form.electric_oven);
  addQty("Coffee Maker", form.coffee_maker);
  addQty("Water Dispenser", form.water_dispenser);
  // Air Conditioner
  addQty("Aircon 0.5 HP", form.aircon.hp_0_5);
  addQty("Aircon 1 HP", form.aircon.hp_1);
  addQty("Aircon 1.5 HP", form.aircon.hp_1_5);
  addQty("Aircon 2 HP", form.aircon.hp_2);
  addQty("Aircon 2.5 HP+", form.aircon.hp_2_5_plus);
  // Water Pump
  addQty("Water Pump 0.5 HP", form.water_pump.hp_0_5);
  addQty("Water Pump 1 HP", form.water_pump.hp_1);
  addQty("Water Pump 1.5 HP", form.water_pump.hp_1_5);
  addQty("Water Pump 2 HP", form.water_pump.hp_2);
  addQty("Water Pump 3 HP+", form.water_pump.hp_3_plus);
  // Personal Care & Utilities
  addQty("Shower Heater", form.shower_heater);
  addQty("Flat Iron", form.flat_iron);

  if (form.has_electric_car && form.electric_car_qty > 0) {
    rows.push({ label: "Electric Vehicle", day: 0, night: 0, ev: form.electric_car_qty });
  }

  for (const a of form.other_appliances) {
    if (a.name.trim().length > 0 && (a.day > 0 || a.night > 0)) {
      rows.push({ label: a.name.trim(), day: a.day, night: a.night });
    }
  }

  return rows;
}

export default function AssessmentPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<AssessmentFormData>(INITIAL_FORM_DATA);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const stepErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem("mac_assessment_step", step.toString());
    } catch { }

    // Real-time step tracking: write current step to the database the moment
    // the user advances. This means exit_step is already persisted before any
    // tab-close event fires, so it survives Vercel cold-start delays and
    // browsers that drop sendBeacon on abrupt unload.
    try {
      const sessionId = sessionStorage.getItem("mac_sid");
      if (sessionId) {
        fetch("/api/analytics/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, exitStep: step }),
        }).catch(() => { });
      }
    } catch { }
  }, [step]);

  const update = (partial: Partial<AssessmentFormData>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const emailValidation = validateEmail(form.email);

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return countFilledAppliances(form) >= 2 && !hasDuplicateOtherAppliances(form);
      case 2:
        return !!(form.monthly_bill_avg && form.monthly_kwh);
      case 3:
        return !!(form.location_lat && form.location_lng);
      case 4:
        return emailValidation.valid;
      default:
        return true;
    }
  };

  const getStepError = (): string => {
    switch (step) {
      case 1:
        if (hasDuplicateOtherAppliances(form))
          return "Other Appliances has duplicate names. Please use a unique name for each.";
        return `Please add at least 2 appliances. You've added ${countFilledAppliances(form)} so far.`;
      case 2: {
        const hasBill = !!form.monthly_bill_avg;
        const hasKwh = !!form.monthly_kwh;
        if (!hasBill && !hasKwh)
          return "Please enter both your average monthly bill and kWh usage.";
        if (!hasBill) return "Please enter your average monthly bill amount.";
        if (!hasKwh) return "Please enter your monthly kWh usage.";
        return "";
      }
      case 3:
        return "Please pin your property location on the map before continuing.";
      default:
        return "";
    }
  };

  const scrollToError = () => {
    setTimeout(
      () =>
        stepErrorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      50
    );
  };

  const handleNext = async () => {
    if (!canProceed()) {
      setStepError(getStepError());
      scrollToError();
      return;
    }

    // Before moving to the review screen, verify the email hasn't been used
    if (step === 4) {
      setIsCheckingEmail(true);
      setStepError(null);
      try {
        const result = await checkEmailAvailable(form.email);
        if (!result.available) {
          setStepError(
            result.error ?? "This email has already been submitted."
          );
          scrollToError();
          return;
        }
      } catch {
        // Network error — allow through; the final guard in submitAssessment
        // will catch it if the email truly is a duplicate.
      } finally {
        setIsCheckingEmail(false);
      }
    }

    setStepError(null);
    setStep((s) => s + 1);
    // setTimeout defers the scroll out of the async context so iOS Safari
    // doesn't strip the user-gesture flag and silently ignore it.
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const handleBack = () => {
    setStepError(null);
    if (step > 1) {
      setStep((s) => s - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = () => {
    if (!canProceed()) return;
    setSubmitError(null);
    startTransition(async () => {
      try {
        const result = await submitAssessment(form);
        if (result.error) {
          setSubmitError(result.error);
          scrollToError();
          return;
        }
        sessionStorage.setItem("mac_submitted", "1");
        router.push("/thank-you");
      } catch {
        setSubmitError("Something went wrong. Please try again.");
        scrollToError();
      }
    });
  };

  const applianceSummary = getApplianceSummary(form);

  return (
    <div className="min-h-screen bg-[#F5F8FF] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-brand-blue/10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo size="md" />
          <span className="text-xs text-navy-800/40 font-medium">Free Assessment</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 pb-28">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center gap-0 mb-4">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => s.id < step && setStep(s.id)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 flex-shrink-0 ${step > s.id
                      ? "bg-solar-500 text-white"
                      : step === s.id
                        /*
                         * Active step uses brand-blue — the logo's primary royal
                         * blue — so the progress indicator is always on-brand.
                         */
                        ? "bg-brand-blue text-white ring-4 ring-brand-blue/15"
                        : "bg-navy-800/10 text-navy-800/30"
                    }`}
                >
                  {step > s.id ? <Check className="w-3.5 h-3.5" /> : s.id}
                </button>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1 bg-navy-800/10 overflow-hidden">
                    <div
                      className="h-full bg-solar-500 step-line"
                      style={{ width: step > s.id ? "100%" : "0%" }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] font-semibold text-navy-800/40 uppercase tracking-widest">
            {STEPS.map((s) => (
              <span key={s.id} className={step === s.id ? "text-brand-blue" : ""}>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div
          className="animate-fade-up opacity-0"
          key={step}
          style={{ animationFillMode: "forwards" }}
        >
          {/* Step title */}
          <div className="mb-8">
            {step === 1 && (
              <>
                <p className="section-label mb-1">Step 1 of 5</p>
                <h1 className="font-display font-bold text-2xl sm:text-3xl text-navy-800">
                  What Appliances Do You Use?
                </h1>
                <p className="text-navy-800/50 text-sm mt-2">
                  Enter how many of each appliance you typically run during the day and night.{" "}
                  <span className="font-medium text-navy-800/70">At least 2 appliances required.</span>
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <p className="section-label mb-1">Step 2 of 5</p>
                <h1 className="font-display font-bold text-2xl sm:text-3xl text-navy-800">
                  Your Monthly Electricity Bill
                </h1>
                <p className="text-navy-800/50 text-sm mt-2">
                  Check your latest LEYECO or VECO statement.{" "}
                  <span className="font-medium text-navy-800/70">Both fields required.</span>
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <p className="section-label mb-1">Step 3 of 5</p>
                <h1 className="font-display font-bold text-2xl sm:text-3xl text-navy-800">
                  Where Is Your Property?
                </h1>
                <p className="text-navy-800/50 text-sm mt-2">
                  Pin your location so we can plan the best installation approach.{" "}
                  <span className="font-medium text-navy-800/70">Required.</span>
                </p>
              </>
            )}
            {step === 4 && (
              <>
                <p className="section-label mb-1">Step 4 of 5</p>
                <h1 className="font-display font-bold text-2xl sm:text-3xl text-navy-800">
                  Where Should We Send Your Results?
                </h1>
                <p className="text-navy-800/50 text-sm mt-2">
                  Our experts will review your details and email you a personalized solar recommendation.
                </p>
              </>
            )}
            {step === 5 && (
              <>
                <p className="section-label mb-1">Step 5 of 5</p>
                <h1 className="font-display font-bold text-2xl sm:text-3xl text-navy-800">
                  Review Your Assessment
                </h1>
                <p className="text-navy-800/50 text-sm mt-2">
                  Double-check your details before submitting. Use the Back button to make any changes.
                </p>
              </>
            )}
          </div>

          {/* Section card */}
          <div className="card p-5 sm:p-7">
            {step === 1 && <AppliancesSection data={form} onChange={update} />}
            {step === 2 && <ElectricitySection data={form} onChange={update} />}
            {step === 3 && <LocationSection data={form} onChange={update} />}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-semibold text-navy-800 mb-2"
                  >
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-800/30 pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => update({ email: e.target.value })}
                      placeholder="you@example.com"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-navy-800 placeholder:text-navy-800/30 focus:outline-none focus:ring-2 transition-all text-sm ${form.email && !emailValidation.valid
                          ? "border-red-300 focus:ring-red-500/20 focus:border-red-400"
                          : form.email && emailValidation.valid
                            ? "border-green-400 focus:ring-green-500/20"
                            : "border-navy-800/15 focus:ring-brand-blue/30 focus:border-brand-blue"
                        }`}
                    />
                    {form.email && emailValidation.valid && (
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  {form.email && !emailValidation.valid && (
                    <p className="mt-2 text-sm text-red-500 flex items-center gap-1.5">
                      <span className="inline-block w-1 h-1 rounded-full bg-red-500 flex-shrink-0" />
                      {emailValidation.error}
                    </p>
                  )}
                </div>

                <div className="bg-brand-blue/6 border border-brand-blue/15 rounded-xl p-4">
                  <p className="text-sm font-semibold text-navy-800 mb-1">
                    What happens next?
                  </p>
                  <ul className="space-y-1 text-sm text-navy-800/60 leading-relaxed">
                    <li>• Our solar experts review your assessment (usually within 1–2 business days)</li>
                    <li>• You receive a personalized recommendation to your email</li>
                    <li>• Includes estimated system size, savings, and next steps</li>
                  </ul>
                </div>

                <p className="text-xs text-navy-800/40 text-center">
                  Your email is only used to send your solar results. We do not share it with third parties.
                </p>
                <p className="text-xs text-solar-600/80 text-center">
                  If you don&apos;t see our reply in your inbox, please check your spam or junk folder.
                </p>
              </div>
            )}
            {step === 5 && (
              <div className="space-y-0 divide-y divide-navy-800/8">
                {/* Appliances summary */}
                <div className="pb-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-solar-500 mb-3">
                    Appliances
                  </p>
                  <div className="space-y-2">
                    {applianceSummary.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm text-navy-800/60">{row.label}</span>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {row.ev !== undefined ? (
                            <span className="text-navy-800">×{row.ev}</span>
                          ) : (
                            <>
                              {row.day > 0 && (
                                <span className="flex items-center gap-1 text-solar-500">
                                  <Sun className="w-3 h-3" />
                                  <span>{row.day}</span>
                                </span>
                              )}
                              {row.day > 0 && row.night > 0 && (
                                <span className="text-navy-800/20 text-xs select-none">|</span>
                              )}
                              {row.night > 0 && (
                                <span className="flex items-center gap-1 text-navy-600">
                                  <Moon className="w-3 h-3" />
                                  <span>{row.night}</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bill summary */}
                <div className="py-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-solar-500 mb-3">
                    Electricity Bill
                  </p>
                  <div className="flex gap-8">
                    <div>
                      <p className="text-xs text-navy-800/40 mb-0.5">Monthly Bill</p>
                      <p className="text-sm font-semibold text-navy-800">
                        ₱
                        {Number(form.monthly_bill_avg).toLocaleString("en-PH", {
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-navy-800/40 mb-0.5">Monthly Usage</p>
                      <p className="text-sm font-semibold text-navy-800">
                        {Number(form.monthly_kwh).toLocaleString("en-PH")}{" "}
                        <span className="font-normal text-navy-800/50">kWh</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Location summary */}
                <div className="py-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-solar-500 mb-3">
                    Location
                  </p>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </span>
                    <span className="text-sm text-navy-800/70">
                      {form.location_address ||
                        `${form.location_lat?.toFixed(5)}, ${form.location_lng?.toFixed(5)}`}
                    </span>
                  </div>
                </div>

                {/* Email summary */}
                <div className="pt-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-solar-500 mb-3">
                    Email
                  </p>
                  <p className="text-sm font-medium text-navy-800 break-all">
                    {form.email}
                  </p>
                  <p className="text-xs text-solar-600/80 mt-3">
                    Don&apos;t forget to check your spam or junk folder if you don&apos;t
                    see our reply within 2 business days.
                  </p>
                </div>
              </div>
            )}
          </div>

          {stepError && (
            <div
              ref={stepErrorRef}
              className="mt-4 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
              <p className="text-sm text-red-600">{stepError}</p>
            </div>
          )}

          {submitError && (
            <div
              ref={stepErrorRef}
              className="mt-4 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
              <p className="text-sm text-red-600">{submitError}</p>
            </div>
          )}
        </div>
      </main>

      {/* Fixed bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-brand-blue/10 z-40">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          {step > 1 && (
            <button type="button" onClick={handleBack} className="btn-secondary flex-none">
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          <div className="flex-1" />

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isCheckingEmail}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingEmail ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Submit Assessment
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
