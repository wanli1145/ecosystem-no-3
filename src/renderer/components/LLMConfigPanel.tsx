import { useState, useEffect } from "react";

interface LLMConfigPanelProps {
  onConfigured: () => void;
}

type ConnectionStatus = "loading" | "connected" | "no-key" | "error";

export function LLMConfigPanel({ onConfigured }: LLMConfigPanelProps): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState("https://api.siliconflow.cn/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("Qwen/Qwen3-8B");
  const [status, setStatus] = useState<ConnectionStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  // 加载已有配置
  useEffect(() => {
    if (!window.ecosystem?.getLLMConfig) { setStatus("no-key"); return; }
    window.ecosystem.getLLMConfig().then((cfg) => {
      setBaseUrl(cfg.baseUrl);
      setModel(cfg.model);
      setStatus(cfg.hasKey ? "connected" : "no-key");
    }).catch(() => setStatus("no-key"));
  }, []);

  async function handleSave() {
    console.log("[LLM] handleSave called", { apiKey: apiKey.slice(0, 5) + "...", baseUrl, model });
    if (!window.ecosystem?.setLLMConfig) {
      console.error("[LLM] window.ecosystem.setLLMConfig not available");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      await window.ecosystem.setLLMConfig({ apiKey, baseUrl, model });
      console.log("[LLM] config saved, testing connection...");
      // 测试连接
      if (!window.ecosystem?.callLLM) {
        console.error("[LLM] window.ecosystem.callLLM not available");
        setStatus("no-key");
        return;
      }
      const result = await window.ecosystem.callLLM(
        [{ role: "user", content: "说'好'" }],
        { maxTokens: 10 }
      );
      console.log("[LLM] test result:", result);
      if (result.ok) {
        setStatus("connected");
        onConfigured();
      } else {
        setStatus("error");
        setErrorMsg(result.error || "连接失败");
      }
    } catch (err) {
      console.error("[LLM] save error:", err);
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  return (
    <div className="llm-config-panel">
      <button
        className="llm-config-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="llm-status-dot" data-status={status} />
        AI 设置
      </button>

      {isExpanded && (
        <div className="llm-config-body">
          <label className="llm-field">
            <span>API URL</span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.siliconflow.cn/v1"
            />
          </label>
          <label className="llm-field">
            <span>API Key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </label>
          <label className="llm-field">
            <span>Model</span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Qwen/Qwen3-8B"
            />
          </label>
          <button className="llm-save-btn" onClick={handleSave} disabled={status === "loading"}>
            {status === "loading" ? "测试中..." : "保存并测试"}
          </button>
          {status === "connected" && <div className="llm-msg ok">已连接</div>}
          {status === "error" && <div className="llm-msg err">{errorMsg}</div>}
        </div>
      )}
    </div>
  );
}
