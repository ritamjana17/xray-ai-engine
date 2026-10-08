"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { ChatMessage } from "@/lib/types";

interface Props {
  message: ChatMessage;
  isDark: boolean;
}

export default function ChatBubble({ message, isDark }: Props) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm shrink-0 mt-1">
          X
        </div>
      )}

      <div className={`max-w-[80%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {/* Image preview (user uploads) */}
        {message.imageData && (
          <div className="rounded-xl overflow-hidden border border-gray-600 max-w-[200px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.imageData}
              alt="Uploaded X-ray"
              className="w-full h-auto object-cover"
            />
          </div>
        )}

        {/* Text bubble */}
        {message.content && (
          <div
            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              isUser
                ? isDark
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-blue-500 text-white rounded-tr-sm"
                : isDark
                ? "bg-gray-800 text-gray-100 rounded-tl-sm"
                : "bg-white border border-gray-200 text-gray-900 rounded-tl-sm shadow-sm"
            }`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Style links
                a: ({ ...props }) => (
                  <a
                    {...props}
                    className="text-cyan-400 underline"
                    target="_blank"
                    rel="noreferrer"
                  />
                ),
                // Style code
                code: ({ ...props }) => (
                  <code
                    {...props}
                    className={`px-1 py-0.5 rounded text-xs font-mono ${
                      isDark ? "bg-gray-700" : "bg-gray-100"
                    }`}
                  />
                ),
                // Remove extra margin from p tags inside bubbles
                p: ({ ...props }) => <p {...props} className="mb-1 last:mb-0" />,
                // Ordered list
                ol: ({ ...props }) => (
                  <ol {...props} className="list-decimal list-inside space-y-1 mb-1" />
                ),
                // Unordered list
                ul: ({ ...props }) => (
                  <ul {...props} className="list-disc list-inside space-y-1 mb-1" />
                ),
                blockquote: ({ ...props }) => (
                  <blockquote
                    {...props}
                    className={`border-l-2 pl-3 italic ${
                      isDark
                        ? "border-amber-500 text-amber-200"
                        : "border-amber-400 text-amber-700"
                    }`}
                  />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Timestamp */}
        <p
          className={`text-[10px] ${
            isDark ? "text-gray-600" : "text-gray-400"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* User avatar */}
      {isUser && (
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm shrink-0 mt-1 ${
            isDark ? "bg-gray-600" : "bg-gray-400"
          }`}
        >
          👤
        </div>
      )}
    </motion.div>
  );
}
