import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AIMarkdownContentProps {
  content: string;
}

export function AIMarkdownContent({ content }: AIMarkdownContentProps) {
  return (
    <div className="select-text cursor-text text-[14px] sm:text-[14.5px] leading-[1.7] text-slate-900 space-y-2.5 font-normal break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-[1.7] select-text break-words">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-slate-950 select-text">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-slate-800 select-text">{children}</em>,
          h1: ({ children }) => (
            <h1 className="text-base sm:text-lg font-bold text-slate-950 mt-3 mb-1.5 border-b border-slate-100 pb-1 select-text">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold text-slate-950 mt-2.5 mb-1 select-text">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 mt-2 mb-1 select-text">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-2.5 space-y-1.5 text-slate-800 select-text">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-2.5 space-y-1.5 text-slate-800 select-text">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed select-text pl-0.5 break-words">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-[#0532e6] bg-blue-50/70 pl-3.5 py-2 my-2.5 text-slate-800 rounded-r-xl select-text">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0532e6] hover:text-[#001258] font-semibold underline decoration-dotted underline-offset-4 select-text transition-colors break-all"
            >
              {children}
            </a>
          ),
          code: ({ children, ...props }: any) => (
            <code
              className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-pink-600 border border-slate-200/70 select-text break-all"
              {...props}
            >
              {children}
            </code>
          ),
          // ChatGPT / Suleco Responsive Table with explicit horizontal scrollbar
          table: ({ children }) => (
            <div className="my-3.5 w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs select-text">
              <div className="overflow-x-auto overflow-y-hidden max-w-full chat-table-scroll select-text p-0.5">
                <table className="w-full min-w-[700px] text-left text-xs border-collapse font-sans">
                  {children}
                </table>
              </div>
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-50/80 border-t border-slate-100 text-[11px] text-slate-400 select-none">
                <span>💡 Kéo thanh trượt hoặc vuốt ngang để xem đủ cột</span>
                <span className="font-mono text-[10px] text-slate-500 font-semibold">↔ Cuộn bảng</span>
              </div>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-900 font-bold select-text">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-100 bg-white select-text">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-blue-50/40 transition-colors select-text">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-[12px] font-bold text-slate-900 whitespace-nowrap select-text tracking-tight">
              {children}
            </th>
          ),
          td: ({ children }) => {
            const rawText = typeof children === "string" ? children.trim() : "";
            const isPhone = /^(0[35789]\d{8}|\+84[35789]\d{8})$/.test(rawText.replace(/[\s\.-]/g, ""));
            return (
              <td className="px-4 py-3 text-[12.5px] text-slate-800 select-text align-middle leading-normal whitespace-nowrap">
                {isPhone ? (
                  <span className="inline-flex items-center rounded-full bg-pink-50 text-pink-700 border border-pink-200/70 px-2.5 py-0.5 font-mono text-[11.5px] font-semibold tracking-wide">
                    {children}
                  </span>
                ) : rawText === "Data mới" ? (
                  <span className="inline-flex items-center rounded-full bg-blue-50 text-[#0532e6] border border-blue-200/70 px-2 py-0.5 text-[11px] font-bold">
                    {children}
                  </span>
                ) : rawText === "Đã đăng ký" ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 px-2 py-0.5 text-[11px] font-bold">
                    {children}
                  </span>
                ) : rawText === "Đang chăm sóc" ? (
                  <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200/70 px-2 py-0.5 text-[11px] font-bold">
                    {children}
                  </span>
                ) : (
                  children
                )}
              </td>
            );
          },
          hr: () => <hr className="my-3 border-slate-200/80" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
