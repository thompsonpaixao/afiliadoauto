'use client';

import React from 'react';
import { CheckCheck } from 'lucide-react';

interface WhatsAppPreviewBubbleProps {
  text: string;
  imageUrl?: string | null;
  time?: string;
}

export function WhatsAppPreviewBubble({ text, imageUrl, time }: WhatsAppPreviewBubbleProps) {
  // Format WhatsApp markdown: *bold*, ~strikethrough~, and ONLY real http/https links
  const renderFormattedText = (rawText: string) => {
    if (!rawText) return null;

    const lines = rawText.split('\n');

    return lines.map((line, lineIdx) => {
      if (!line.trim()) {
        return <div key={lineIdx} className="h-2" />;
      }

      // Regex matching:
      // 1. Strictly URLs starting with http:// or https:// (NEVER match numbers, prices like R$ 49,90, or IDs)
      // 2. *bold*
      // 3. ~strike~
      const tokenRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)|(\*[^*\n]+\*)|(~[^~\n]+~)/g;

      const elements: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = tokenRegex.exec(line)) !== null) {
        // Plain text before match
        if (match.index > lastIndex) {
          elements.push(line.substring(lastIndex, match.index));
        }

        const [fullMatch, urlMatch, boldMatch, strikeMatch] = match;

        if (urlMatch) {
          // Clean any trailing punctuation from URL (e.g. "https://link.com.")
          const cleanUrl = urlMatch.replace(/[.,;:!?)]+$/, '');
          const trailing = urlMatch.slice(cleanUrl.length);

          elements.push(
            <a
              key={`${lineIdx}-${match.index}`}
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#027EB5] hover:underline break-all"
            >
              {cleanUrl}
            </a>
          );
          if (trailing) {
            elements.push(trailing);
          }
        } else if (boldMatch) {
          const content = boldMatch.slice(1, -1);
          elements.push(
            <strong key={`${lineIdx}-${match.index}`} className="font-bold text-[#111B21]">
              {content}
            </strong>
          );
        } else if (strikeMatch) {
          const content = strikeMatch.slice(1, -1);
          elements.push(
            <del key={`${lineIdx}-${match.index}`} className="line-through text-gray-500">
              {content}
            </del>
          );
        }

        lastIndex = tokenRegex.lastIndex;
      }

      if (lastIndex < line.length) {
        elements.push(line.substring(lastIndex));
      }

      return (
        <div key={lineIdx} className="leading-relaxed">
          {elements}
        </div>
      );
    });
  };

  const displayTime = time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-2xl bg-[#EFEAE2] p-4 border border-[#DAD3CC] shadow-inner max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-black/5 overflow-hidden">
        {/* Product Image preview if available */}
        {imageUrl && (
          <div className="w-full bg-gray-50 border-b border-black/5 relative aspect-square max-h-56 overflow-hidden flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Imagem do produto"
              className="w-full h-full object-contain p-2"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Message Content */}
        <div className="p-3 text-xs font-sans text-[#111B21] space-y-0.5">
          {renderFormattedText(text)}

          {/* WhatsApp message footer with timestamp and read receipt */}
          <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-gray-400 font-mono select-none">
            <span>{displayTime}</span>
            <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" />
          </div>
        </div>
      </div>
    </div>
  );
}
