import { Linking } from "react-native";
import { toast } from "@/lib/toast";
import {
  exportMemberInviteXlsx,
  webAppBaseUrl,
} from "@/api/guest";

export type InviteQrExportRow = {
  index: number;
  token: string;
  url: string;
  expires_at: string | null;
};

export type InviteQrDownloadResult = {
  ok: boolean;
  /** HTTPS download URL from the server (Excel with QR images). */
  uri?: string;
  fileName: string;
};

/**
 * Ask the server to build an Excel workbook with QR images, then return
 * the short-lived download link for the mobile UI to show / open.
 */
export async function downloadInviteQrCsv(params: {
  rows: InviteQrExportRow[];
  fileName: string;
}): Promise<InviteQrDownloadResult> {
  const tokens = params.rows.map((row) => row.token).filter(Boolean);
  if (tokens.length === 0) {
    toast.error("No invite tokens to export.");
    return { ok: false, fileName: params.fileName };
  }

  const result = await exportMemberInviteXlsx({
    tokens,
    join_base_url: webAppBaseUrl(),
  });

  if (result.error || !result.data?.download_url) {
    toast.error(result.error ?? "Could not build Excel download.");
    return { ok: false, fileName: params.fileName };
  }

  const fileName = result.data.file_name || params.fileName.replace(/\.csv$/i, ".xlsx");
  const downloadUrl = result.data.download_url;

  try {
    const canOpen = await Linking.canOpenURL(downloadUrl);
    if (canOpen) {
      await Linking.openURL(downloadUrl);
    }
  } catch {
    // Still return the link so the UI can show/copy it.
  }

  toast.success("Excel ready — open the download link.");
  return { ok: true, uri: downloadUrl, fileName };
}

/** @deprecated Use downloadInviteQrCsv */
export const shareInviteQrCsv = downloadInviteQrCsv;
