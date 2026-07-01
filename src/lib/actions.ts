"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateEmail, escapeHtml } from "@/lib/email-validator";
import type { AssessmentFormData } from "@/lib/types";

// ─── Other Appliance validation constants ─────────────────────────────────────

const OTHER_APPLIANCE_MAX = 10;
const OTHER_APPLIANCE_NAME_MAX = 50;
const OTHER_APPLIANCE_QTY_MAX = 99;

// ─── Customer: Submit Assessment ──────────────────────────────────────────────

export async function submitAssessment(
  data: AssessmentFormData
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const emailCheck = validateEmail(data.email);
  if (!emailCheck.valid) {
    return { error: emailCheck.error ?? "Invalid email address." };
  }

  const normalised = data.email.trim().toLowerCase();

  const { data: blocked } = await supabase
    .from("blocked_emails")
    .select("email")
    .eq("email", normalised)
    .maybeSingle();

  if (blocked) {
    return { error: "Unable to submit an assessment with this email address." };
  }

  const { data: existing } = await supabase
    .from("assessments")
    .select("id")
    .eq("email", normalised)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return {
      error:
        "You already have a pending assessment submitted with this email. Our team will review it and get back to you soon.",
    };
  }

  const sanitizedOther = (data.other_appliances ?? [])
    .map((a) => ({
      name: a.name.trim().replace(/[\x00-\x1F\x7F]/g, ""),
      day: Math.max(0, Math.min(OTHER_APPLIANCE_QTY_MAX, Math.floor(a.day))),
      night: Math.max(0, Math.min(OTHER_APPLIANCE_QTY_MAX, Math.floor(a.night))),
    }))
    .filter((a) => a.name.length > 0 && a.day + a.night > 0);

  if (sanitizedOther.length > OTHER_APPLIANCE_MAX) {
    return { error: `Maximum ${OTHER_APPLIANCE_MAX} custom appliances allowed.` };
  }

  for (const a of sanitizedOther) {
    if (a.name.length > OTHER_APPLIANCE_NAME_MAX) {
      return { error: `Appliance name must be ${OTHER_APPLIANCE_NAME_MAX} characters or fewer.` };
    }
  }

  const { error } = await supabase.from("assessments").insert({
    lights_day: data.lights.day,
    lights_night: data.lights.night,
    fan_day: data.fan.day,
    fan_night: data.fan.night,
    tv_day: data.tv.day,
    tv_night: data.tv.night,
    desktop_day: data.desktop.day,
    desktop_night: data.desktop.night,
    ref_day: data.ref.day,
    ref_night: data.ref.night,
    rice_cooker_day: data.rice_cooker.day,
    rice_cooker_night: data.rice_cooker.night,
    induction_day: data.induction_cooker.day,
    induction_night: data.induction_cooker.night,
    electric_oven_day: data.electric_oven.day,
    electric_oven_night: data.electric_oven.night,
    coffee_maker_day: data.coffee_maker.day,
    coffee_maker_night: data.coffee_maker.night,
    water_dispenser_day: data.water_dispenser.day,
    water_dispenser_night: data.water_dispenser.night,
    ac_05hp_day: data.aircon.hp_0_5.day,
    ac_05hp_night: data.aircon.hp_0_5.night,
    ac_1hp_day: data.aircon.hp_1.day,
    ac_1hp_night: data.aircon.hp_1.night,
    ac_15hp_day: data.aircon.hp_1_5.day,
    ac_15hp_night: data.aircon.hp_1_5.night,
    ac_2hp_day: data.aircon.hp_2.day,
    ac_2hp_night: data.aircon.hp_2.night,
    ac_25hp_day: data.aircon.hp_2_5_plus.day,
    ac_25hp_night: data.aircon.hp_2_5_plus.night,
    wp_05hp_day: data.water_pump.hp_0_5.day,
    wp_05hp_night: data.water_pump.hp_0_5.night,
    wp_1hp_day: data.water_pump.hp_1.day,
    wp_1hp_night: data.water_pump.hp_1.night,
    wp_15hp_day: data.water_pump.hp_1_5.day,
    wp_15hp_night: data.water_pump.hp_1_5.night,
    wp_2hp_day: data.water_pump.hp_2.day,
    wp_2hp_night: data.water_pump.hp_2.night,
    wp_3hp_day: data.water_pump.hp_3_plus.day,
    wp_3hp_night: data.water_pump.hp_3_plus.night,
    heater_day: data.shower_heater.day,
    heater_night: data.shower_heater.night,
    flat_iron_day: data.flat_iron.day,
    flat_iron_night: data.flat_iron.night,
    has_electric_car: data.has_electric_car,
    electric_car_qty: data.has_electric_car ? data.electric_car_qty : 0,
    other_appliances: sanitizedOther,
    monthly_bill_avg: data.monthly_bill_avg ? parseFloat(data.monthly_bill_avg) : null,
    monthly_kwh: data.monthly_kwh ? parseFloat(data.monthly_kwh) : null,
    location_address: data.location_address || null,
    location_lat: data.location_lat,
    location_lng: data.location_lng,
    email: normalised,
    status: "pending",
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "You already have a pending assessment submitted with this email. Our team will review it and get back to you soon.",
      };
    }
    return { error: error.message };
  }

  return { success: true };
}

// ─── Customer: Check Email Availability ───────────────────────────────────────

export async function checkEmailAvailable(
  email: string
): Promise<{ available: boolean; error?: string }> {
  const supabase = await createClient();

  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    return { available: false, error: emailCheck.error ?? "Invalid email." };
  }

  const normalised = email.trim().toLowerCase();

  const { data: blocked } = await supabase
    .from("blocked_emails")
    .select("email")
    .eq("email", normalised)
    .maybeSingle();

  if (blocked) {
    return {
      available: false,
      error: "Unable to submit an assessment with this email address.",
    };
  }

  const { data } = await supabase
    .from("assessments")
    .select("id")
    .eq("email", normalised)
    .eq("status", "pending")
    .maybeSingle();

  if (data) {
    return {
      available: false,
      error:
        "You already have a pending assessment submitted with this email. Our team will review it and get back to you soon.",
    };
  }

  return { available: true };
}

// ─── Admin: Auth ───────────────────────────────────────────────────────────────

export async function adminLogin(formData: FormData) {
  const supabase = await createClient();
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Email and password required." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid credentials." };

  redirect("/admin");
}

export async function adminLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ─── Admin: Delete Submission ──────────────────────────────────────────────────

export async function deleteAssessment(
  id: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const { error } = await supabase.from("assessments").delete().eq("id", id);
  if (error) return { error: error.message };

  return { success: true };
}

// ─── Admin: Block / Unblock Email ─────────────────────────────────────────────

export async function blockEmail(
  email: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { error: "Invalid email." };

  const { error } = await supabase
    .from("blocked_emails")
    .insert({ email: email.trim().toLowerCase(), blocked_by: user.id });

  if (error) {
    if (error.code === "23505") return { error: "Email is already blocked." };
    return { error: error.message };
  }
  return { success: true };
}

export async function unblockEmail(
  email: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const { error } = await supabase
    .from("blocked_emails")
    .delete()
    .eq("email", email.trim().toLowerCase());

  if (error) return { error: error.message };
  return { success: true };
}

// ─── Admin: Send Result Email (Brevo) ─────────────────────────────────────────

export async function sendResultEmail(
  assessmentId: string,
  toEmail: string,
  subject: string,
  message: string,
  adminNote: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const emailCheck = validateEmail(toEmail);
  if (!emailCheck.valid) return { error: "Invalid recipient email." };

  const safeSubject = subject.trim() || "Your MAC Solar Assessment Results";
  const safeMessage = escapeHtml(message.trim());

  const logoUrl = process.env.LOGO_URL;
  if (!logoUrl) return { error: "Logo URL not configured." };

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:580px;">

        <!-- HEADER -->
        <tr><td style="background:#ffffff;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;border-bottom:4px solid #1756C8;">
          <img src="${logoUrl}" alt="MAC Solar Installation Services" width="280" style="max-width:100%;height:auto;display:block;margin:0 auto;" />
        </td></tr>

        <!-- BODY -->
        <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
          <h2 style="color:#0D2040;font-size:18px;font-weight:700;margin:0 0 20px;padding-bottom:12px;border-bottom:1px solid #E2E8F0;">${escapeHtml(safeSubject)}</h2>
          <div style="color:#374151;font-size:14px;line-height:1.8;white-space:pre-wrap;">${safeMessage}</div>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#1756C8;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
          <p style="color:rgba(255,255,255,0.5);font-size:11px;margin:0;line-height:1.8;">
            This email was sent by <strong style="color:rgba(255,255,255,0.75);">MAC Solar</strong> in response to your solar assessment.<br>
            For questions, reply to this email or visit our office in Brgy. San Roque Real St. Alangalang, Leyte.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) return { error: "Sender email not configured." };

  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "MAC Solar", email: senderEmail },
      to: [{ email: toEmail }],
      subject: safeSubject,
      htmlContent: emailHtml,
    }),
  });

  if (!brevoRes.ok) {
    const errBody = await brevoRes.json().catch(() => ({}));
    const errMsg = (errBody as { message?: string }).message;
    return {
      error: errMsg ?? "Failed to send email. Check your BREVO_API_KEY.",
    };
  }

  const { error: updateError } = await supabase
    .from("assessments")
    .update({
      status: "reviewed",
      email_sent_at: new Date().toISOString(),
      admin_note: adminNote?.trim() || null,
    })
    .eq("id", assessmentId);

  if (updateError) return { error: updateError.message };

  return { success: true };
}

// ─── Admin: Mark Reviewed (without emailing) ──────────────────────────────────

export async function markAsReviewed(
  id: string,
  note: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const { error } = await supabase
    .from("assessments")
    .update({ status: "reviewed", admin_note: note?.trim() || null })
    .eq("id", id);

  if (error) return { error: error.message };
  return { success: true };
}
