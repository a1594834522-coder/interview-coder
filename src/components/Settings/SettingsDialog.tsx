import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useToast } from "../../contexts/toast";

type APIProvider = "openai" | "gemini" | "anthropic";
const DEFAULT_MODELS: Record<APIProvider, string> = {
  openai: "gpt5",
  gemini: "gemini2.5flash",
  anthropic: "claude-sonnet-4-5"
};

const DEFAULT_BASE_URLS: Record<APIProvider, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com",
  anthropic: "https://api.anthropic.com"
};

interface SettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ open: externalOpen, onOpenChange }: SettingsDialogProps) {
  const [open, setOpen] = useState(externalOpen || false);
  const [apiKey, setApiKey] = useState("");
  const [apiProvider, setApiProvider] = useState<APIProvider>("openai");
  const [openaiModel, setOpenaiModel] = useState(DEFAULT_MODELS.openai);
  const [geminiModel, setGeminiModel] = useState(DEFAULT_MODELS.gemini);
  const [anthropicModel, setAnthropicModel] = useState(DEFAULT_MODELS.anthropic);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(DEFAULT_BASE_URLS.openai);
  const [geminiBaseUrl, setGeminiBaseUrl] = useState(DEFAULT_BASE_URLS.gemini);
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState(DEFAULT_BASE_URLS.anthropic);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();
  const providerDisplayName: Record<APIProvider, string> = {
    openai: "OpenAI",
    gemini: "Google",
    anthropic: "Anthropic"
  };

  // Sync with external open state
  useEffect(() => {
    if (externalOpen !== undefined) {
      setOpen(externalOpen);
    }
  }, [externalOpen]);

  // Handle open state changes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    // Only call onOpenChange when there's actually a change
    if (onOpenChange && newOpen !== externalOpen) {
      onOpenChange(newOpen);
    }
  };
  
  // Load current config on dialog open
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      interface Config {
        apiKey?: string;
        apiProvider?: APIProvider;
        openaiModel?: string;
        geminiModel?: string;
        anthropicModel?: string;
        openaiBaseUrl?: string;
        geminiBaseUrl?: string;
        anthropicBaseUrl?: string;
      }

      window.electronAPI
        .getConfig()
        .then((config: Config) => {
          const resolvedProvider = config.apiProvider || "openai";

          setApiKey(config.apiKey || "");
          setApiProvider(resolvedProvider);
          setOpenaiModel(config.openaiModel || DEFAULT_MODELS.openai);
          setGeminiModel(config.geminiModel || DEFAULT_MODELS.gemini);
          setAnthropicModel(config.anthropicModel || DEFAULT_MODELS.anthropic);
          setOpenaiBaseUrl(config.openaiBaseUrl || DEFAULT_BASE_URLS.openai);
          setGeminiBaseUrl(config.geminiBaseUrl || DEFAULT_BASE_URLS.gemini);
          setAnthropicBaseUrl(config.anthropicBaseUrl || DEFAULT_BASE_URLS.anthropic);
        })
        .catch((error: unknown) => {
          console.error("Failed to load config:", error);
          showToast("Error", "Failed to load settings", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, showToast]);

  // Handle API provider change
  const handleProviderChange = (provider: APIProvider) => {
    setApiProvider(provider);
    if (provider === "openai") {
      if (!openaiModel.trim()) {
        setOpenaiModel(DEFAULT_MODELS.openai);
      }
      if (!openaiBaseUrl.trim()) {
        setOpenaiBaseUrl(DEFAULT_BASE_URLS.openai);
      }
    } else if (provider === "gemini") {
      if (!geminiModel.trim()) {
        setGeminiModel(DEFAULT_MODELS.gemini);
      }
      if (!geminiBaseUrl.trim()) {
        setGeminiBaseUrl(DEFAULT_BASE_URLS.gemini);
      }
    } else {
      if (!anthropicModel.trim()) {
        setAnthropicModel(DEFAULT_MODELS.anthropic);
      }
      if (!anthropicBaseUrl.trim()) {
        setAnthropicBaseUrl(DEFAULT_BASE_URLS.anthropic);
      }
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.updateConfig({
        apiKey,
        apiProvider,
        openaiModel,
        geminiModel,
        anthropicModel,
        openaiBaseUrl,
        geminiBaseUrl,
        anthropicBaseUrl,
      });
      
      if (result) {
        showToast("Success", "Settings saved successfully", "success");
        handleOpenChange(false);
        
        // Force reload the app to apply the API key
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      showToast("Error", "Failed to save settings", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Mask API key for display
  const maskApiKey = (key: string) => {
    if (!key || key.length < 10) return "";
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  // Open external link handler
  const openExternalLink = (url: string) => {
    window.electronAPI.openLink(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md bg-black border border-white/10 text-white settings-dialog"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(450px, 90vw)',
          height: 'auto',
          minHeight: '400px',
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 9999,
          margin: 0,
          padding: '20px',
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          animation: 'fadeIn 0.25s ease forwards',
          opacity: 0.98
        }}
      >        
        <DialogHeader>
          <DialogTitle>API Settings</DialogTitle>
          <DialogDescription className="text-white/70">
            Configure your API key and model preferences. You'll need your own API key to use this application.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* API Provider Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white">API Provider</label>
            <div className="flex gap-2">
              <div
                className={`flex-1 p-2 rounded-lg cursor-pointer transition-colors ${
                  apiProvider === "openai"
                    ? "bg-white/10 border border-white/20"
                    : "bg-black/30 border border-white/5 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("openai")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "openai" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">OpenAI</p>
                    <p className="text-xs text-white/60">默认模型：gpt5（可自定义）</p>
                  </div>
                </div>
              </div>
              <div
                className={`flex-1 p-2 rounded-lg cursor-pointer transition-colors ${
                  apiProvider === "gemini"
                    ? "bg-white/10 border border-white/20"
                    : "bg-black/30 border border-white/5 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("gemini")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "gemini" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">Gemini</p>
                    <p className="text-xs text-white/60">默认模型：gemini2.5flash（可自定义）</p>
                  </div>
                </div>
              </div>
              <div
                className={`flex-1 p-2 rounded-lg cursor-pointer transition-colors ${
                  apiProvider === "anthropic"
                    ? "bg-white/10 border border-white/20"
                    : "bg-black/30 border border-white/5 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("anthropic")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "anthropic" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">Claude</p>
                    <p className="text-xs text-white/60">默认模型：claude-sonnet-4-5（可自定义）</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white" htmlFor="apiKey">
            {apiProvider === "openai" ? "OpenAI API Key" : 
             apiProvider === "gemini" ? "Gemini API Key" : 
             "Anthropic API Key"}
            </label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                apiProvider === "openai" ? "sk-..." : 
                apiProvider === "gemini" ? "Enter your Gemini API key" :
                "sk-ant-..."
              }
              className="bg-black/50 border-white/10 text-white"
            />
            {apiKey && (
              <p className="text-xs text-white/50">
                Current: {maskApiKey(apiKey)}
              </p>
            )}
            <p className="text-xs text-white/50">
              Your API key is stored locally and never sent to any server except {providerDisplayName[apiProvider]}
            </p>
            <div className="mt-2 p-2 rounded-md bg-white/5 border border-white/10">
              <p className="text-xs text-white/80 mb-1">Don't have an API key?</p>
              {apiProvider === "openai" ? (
                <>
                  <p className="text-xs text-white/60 mb-1">1. Create an account at <button 
                    onClick={() => openExternalLink('https://platform.openai.com/signup')} 
                    className="text-blue-400 hover:underline cursor-pointer">OpenAI</button>
                  </p>
                  <p className="text-xs text-white/60 mb-1">2. Go to <button 
                    onClick={() => openExternalLink('https://platform.openai.com/api-keys')} 
                    className="text-blue-400 hover:underline cursor-pointer">API Keys</button> section
                  </p>
                  <p className="text-xs text-white/60">3. Create a new secret key and paste it here</p>
                </>
              ) : apiProvider === "gemini" ?  (
                <>
                  <p className="text-xs text-white/60 mb-1">1. Create an account at <button 
                    onClick={() => openExternalLink('https://aistudio.google.com/')} 
                    className="text-blue-400 hover:underline cursor-pointer">Google AI Studio</button>
                  </p>
                  <p className="text-xs text-white/60 mb-1">2. Go to the <button 
                    onClick={() => openExternalLink('https://aistudio.google.com/app/apikey')} 
                    className="text-blue-400 hover:underline cursor-pointer">API Keys</button> section
                  </p>
                  <p className="text-xs text-white/60">3. Create a new API key and paste it here</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-white/60 mb-1">1. Create an account at <button 
                    onClick={() => openExternalLink('https://console.anthropic.com/signup')} 
                    className="text-blue-400 hover:underline cursor-pointer">Anthropic</button>
                  </p>
                  <p className="text-xs text-white/60 mb-1">2. Go to the <button 
                    onClick={() => openExternalLink('https://console.anthropic.com/settings/keys')} 
                    className="text-blue-400 hover:underline cursor-pointer">API Keys</button> section
                  </p>
                  <p className="text-xs text-white/60">3. Create a new API key and paste it here</p>
                </>
              )}
            </div>
          </div>
          
          <div className="space-y-2 mt-4">
            <label className="text-sm font-medium text-white mb-2 block">Keyboard Shortcuts</label>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div className="text-white/70">Toggle Visibility</div>
                <div className="text-white/90 font-mono">Ctrl+B / Cmd+B</div>
                
                <div className="text-white/70">Take Screenshot</div>
                <div className="text-white/90 font-mono">Ctrl+H / Cmd+H</div>
                
                <div className="text-white/70">Process Screenshots</div>
                <div className="text-white/90 font-mono">Ctrl+Enter / Cmd+Enter</div>
                
                <div className="text-white/70">Delete Last Screenshot</div>
                <div className="text-white/90 font-mono">Ctrl+L / Cmd+L</div>
                
                <div className="text-white/70">Reset View</div>
                <div className="text-white/90 font-mono">Ctrl+R / Cmd+R</div>
                
                <div className="text-white/70">Quit Application</div>
                <div className="text-white/90 font-mono">Ctrl+Q / Cmd+Q</div>
                
                <div className="text-white/70">Move Window</div>
                <div className="text-white/90 font-mono">Ctrl+Arrow Keys</div>
                
                <div className="text-white/70">Decrease Opacity</div>
                <div className="text-white/90 font-mono">Ctrl+[ / Cmd+[</div>
                
                <div className="text-white/70">Increase Opacity</div>
                <div className="text-white/90 font-mono">Ctrl+] / Cmd+]</div>
                
                <div className="text-white/70">Zoom Out</div>
                <div className="text-white/90 font-mono">Ctrl+- / Cmd+-</div>
                
                <div className="text-white/70">Reset Zoom</div>
                <div className="text-white/90 font-mono">Ctrl+0 / Cmd+0</div>
                
                <div className="text-white/70">Zoom In</div>
                <div className="text-white/90 font-mono">Ctrl+= / Cmd+=</div>
              </div>
            </div>
          </div>
          
          <div className="space-y-4 mt-4">
            <label className="text-sm font-medium text-white">Provider Configuration</label>
            <p className="text-xs text-white/60 -mt-3 mb-2">
              设置每个厂商的 Base URL 与模型名称，方便接入自建代理或私有部署。
            </p>

            {[
              {
                key: "openai" as APIProvider,
                title: "OpenAI",
                description: "兼容 OpenAI 接口的服务（包括自建兼容网关）",
                model: openaiModel,
                setModel: setOpenaiModel,
                baseUrl: openaiBaseUrl,
                setBaseUrl: setOpenaiBaseUrl
              },
              {
                key: "gemini" as APIProvider,
                title: "Gemini",
                description: "Google Gemini 或兼容的多模态服务",
                model: geminiModel,
                setModel: setGeminiModel,
                baseUrl: geminiBaseUrl,
                setBaseUrl: setGeminiBaseUrl
              },
              {
                key: "anthropic" as APIProvider,
                title: "Anthropic",
                description: "Claude 系列或兼容的 API",
                model: anthropicModel,
                setModel: setAnthropicModel,
                baseUrl: anthropicBaseUrl,
                setBaseUrl: setAnthropicBaseUrl
              }
            ].map(({ key, title, description, model, setModel, baseUrl, setBaseUrl }) => (
              <div
                key={key}
                className={`rounded-lg border p-3 space-y-3 transition-colors ${
                  apiProvider === key
                    ? "border-white/40 bg-white/10"
                    : "border-white/10 bg-black/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-white/60">{description}</p>
                  </div>
                  {apiProvider === key && (
                    <span className="text-xs text-white/70 border border-white/30 rounded px-2 py-0.5">
                      当前使用
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-white/60 block mb-1">Base URL</label>
                    <Input
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder={DEFAULT_BASE_URLS[key]}
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 block mb-1">模型名称</label>
                    <Input
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder={DEFAULT_MODELS[key]}
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                  <p className="text-[10px] text-white/50">
                    默认值：{DEFAULT_MODELS[key]} · Base URL 默认：{DEFAULT_BASE_URLS[key]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-white/10 hover:bg-white/5 text-white"
          >
            Cancel
          </Button>
          <Button
            className="px-4 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors"
            onClick={handleSave}
            disabled={isLoading || !apiKey}
          >
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
