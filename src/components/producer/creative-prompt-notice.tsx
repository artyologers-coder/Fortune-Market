"use client";

import { useRef, useState } from "react";
import { FORTUNE_MARKET_CREATIVE_PROMPT } from "@/lib/creative/prompts";

export function CreativePromptNotice() {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(FORTUNE_MARKET_CREATIVE_PROMPT);
    } catch {
      if (textareaRef.current) {
        textareaRef.current.value = FORTUNE_MARKET_CREATIVE_PROMPT;
        textareaRef.current.select();
        document.execCommand("copy");
        textareaRef.current.value = "";
      }
    } finally {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="mt-3 bg-primary-50 border border-primary-100 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none mt-0.5">📸</div>
        <div className="space-y-2 flex-1">
          <h4 className="font-semibold text-gray-900 text-sm">
            Create a Fortune Market Creative — a premium ad image for your product
          </h4>
          <p className="text-sm text-gray-600 leading-relaxed">
            Turn your product photo into a professional commercial advertisement using
            any AI image generator. Copy the prompt below, paste it in your generator
            alongside your product photo (and your product brand logo, if you have one),
            then download the square 1000×1000 result and upload it using the image
            options above. The prompt keeps your real product authentic and adds no text.
          </p>
          <button
            type="button"
            onClick={copyPrompt}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              copied
                ? "bg-green-600 text-white"
                : "bg-primary text-white hover:bg-primary-600"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
            {copied ? "Prompt Copied" : "Copy Prompt"}
          </button>
          {copied && (
            <p className="text-xs text-green-700 font-medium">
              ✓ Prompt copied to clipboard
            </p>
          )}
          <textarea ref={textareaRef} className="sr-only" readOnly tabIndex={-1} />
        </div>
      </div>
    </div>
  );
}