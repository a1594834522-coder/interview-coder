// ConfigHelper.ts
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import { OpenAI } from "openai"

interface Config {
  apiKey: string;
  apiProvider: "openai" | "gemini" | "anthropic";
  openaiModel: string;
  geminiModel: string;
  anthropicModel: string;
  openaiBaseUrl: string;
  geminiBaseUrl: string;
  anthropicBaseUrl: string;
  language: string;
  opacity: number;
  // Legacy fields retained for backward compatibility with existing config files
  extractionModel?: string;
  solutionModel?: string;
  debuggingModel?: string;
}

const DEFAULT_MODELS = {
  openai: "gpt5",
  gemini: "gemini2.5flash",
  anthropic: "claude-sonnet-4-5"
} as const;

const DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com",
  anthropic: "https://api.anthropic.com"
} as const;

const sanitizeModelForProvider = (
  value: string,
  provider: "openai" | "gemini" | "anthropic"
): string => {
  const fallback = DEFAULT_MODELS[provider];
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return fallback;
  }

  const lower = trimmed.toLowerCase();

  if (provider === "openai") {
    if (lower.includes("gemini") || lower.includes("claude")) {
      return fallback;
    }
  } else if (provider === "gemini") {
    if (lower.includes("gpt") || lower.includes("claude")) {
      return fallback;
    }
  } else if (provider === "anthropic") {
    if (lower.includes("gpt") || lower.includes("gemini")) {
      return fallback;
    }
  }

  return trimmed;
};

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    apiKey: "",
    apiProvider: "gemini", // Default to Gemini
    openaiModel: DEFAULT_MODELS.openai,
    geminiModel: DEFAULT_MODELS.gemini,
    anthropicModel: DEFAULT_MODELS.anthropic,
    openaiBaseUrl: DEFAULT_BASE_URLS.openai,
    geminiBaseUrl: DEFAULT_BASE_URLS.gemini,
    anthropicBaseUrl: DEFAULT_BASE_URLS.anthropic,
    language: "python",
    opacity: 1.0
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
      console.log('Config path:', this.configPath);
    } catch (err) {
      console.warn('Could not access user data path, using fallback');
      this.configPath = path.join(process.cwd(), 'config.json');
    }
    
    // Ensure the initial config file exists
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  public loadConfig(): Config {
    const ensureValue = (value: unknown, fallback: string): string => {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
      return fallback;
    };

    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const rawConfig = JSON.parse(configData);

        let provider: "openai" | "gemini" | "anthropic" = rawConfig.apiProvider;
        if (provider !== "openai" && provider !== "gemini" && provider !== "anthropic") {
          provider = this.defaultConfig.apiProvider;
        }

        const pickLegacyModel = (): string | undefined => {
          const candidates = [
            rawConfig.extractionModel,
            rawConfig.solutionModel,
            rawConfig.debuggingModel
          ];

          for (const candidate of candidates) {
            if (typeof candidate === "string" && candidate.trim().length > 0) {
              return candidate.trim();
            }
          }
          return undefined;
        };

        const legacyModel = pickLegacyModel();

        let openaiModel = ensureValue(
          rawConfig.openaiModel,
          this.defaultConfig.openaiModel
        );
        let geminiModel = ensureValue(
          rawConfig.geminiModel,
          this.defaultConfig.geminiModel
        );
        let anthropicModel = ensureValue(
          rawConfig.anthropicModel,
          this.defaultConfig.anthropicModel
        );

        if (!rawConfig.openaiModel && provider === "openai" && legacyModel) {
          openaiModel = ensureValue(legacyModel, this.defaultConfig.openaiModel);
        }
        if (!rawConfig.geminiModel && provider === "gemini" && legacyModel) {
          geminiModel = ensureValue(legacyModel, this.defaultConfig.geminiModel);
        }
        if (!rawConfig.anthropicModel && provider === "anthropic" && legacyModel) {
          anthropicModel = ensureValue(legacyModel, this.defaultConfig.anthropicModel);
        }

        const migratedConfig: Config = {
          ...this.defaultConfig,
          ...rawConfig,
          apiProvider: provider,
          openaiModel: sanitizeModelForProvider(openaiModel, "openai"),
          geminiModel: sanitizeModelForProvider(geminiModel, "gemini"),
          anthropicModel: sanitizeModelForProvider(anthropicModel, "anthropic"),
          openaiBaseUrl: ensureValue(
            rawConfig.openaiBaseUrl,
            this.defaultConfig.openaiBaseUrl
          ),
          geminiBaseUrl: ensureValue(
            rawConfig.geminiBaseUrl,
            this.defaultConfig.geminiBaseUrl
          ),
          anthropicBaseUrl: ensureValue(
            rawConfig.anthropicBaseUrl,
            this.defaultConfig.anthropicBaseUrl
          )
        };

        return migratedConfig;
      }

      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to disk
   */
  public saveConfig(config: Config): void {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      // Write the config file
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  /**
   * Update specific configuration values
   */
  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();
      let provider = updates.apiProvider || currentConfig.apiProvider;

      const normalize = (value: string | undefined, fallback: string): string => {
        if (value === undefined) {
          return fallback;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
      };

      // Auto-detect provider based on API key format if a new key is provided
      if (updates.apiKey && !updates.apiProvider) {
        const trimmedKey = updates.apiKey.trim();
        if (trimmedKey.startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format");
          updates.apiProvider = provider;
        } else if (trimmedKey.startsWith('sk-')) {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format");
          updates.apiProvider = provider;
        } else {
          provider = "gemini";
          console.log("Using Gemini API key format (default)");
          updates.apiProvider = provider;
        }
      }

      // Normalize base URLs and model names if provided
      const normalizedUpdates: Partial<Config> = { ...updates };

      if (updates.openaiModel !== undefined || (updates.apiProvider === "openai" && currentConfig.openaiModel === undefined)) {
        normalizedUpdates.openaiModel = sanitizeModelForProvider(
          normalize(updates.openaiModel, DEFAULT_MODELS.openai),
          "openai"
        );
      }
      if (updates.geminiModel !== undefined || (updates.apiProvider === "gemini" && currentConfig.geminiModel === undefined)) {
        normalizedUpdates.geminiModel = sanitizeModelForProvider(
          normalize(updates.geminiModel, DEFAULT_MODELS.gemini),
          "gemini"
        );
      }
      if (updates.anthropicModel !== undefined || (updates.apiProvider === "anthropic" && currentConfig.anthropicModel === undefined)) {
        normalizedUpdates.anthropicModel = sanitizeModelForProvider(
          normalize(updates.anthropicModel, DEFAULT_MODELS.anthropic),
          "anthropic"
        );
      }

      if (updates.openaiBaseUrl !== undefined || (updates.apiProvider === "openai" && currentConfig.openaiBaseUrl === undefined)) {
        normalizedUpdates.openaiBaseUrl = normalize(updates.openaiBaseUrl, DEFAULT_BASE_URLS.openai);
      }
      if (updates.geminiBaseUrl !== undefined || (updates.apiProvider === "gemini" && currentConfig.geminiBaseUrl === undefined)) {
        normalizedUpdates.geminiBaseUrl = normalize(updates.geminiBaseUrl, DEFAULT_BASE_URLS.gemini);
      }
      if (updates.anthropicBaseUrl !== undefined || (updates.apiProvider === "anthropic" && currentConfig.anthropicBaseUrl === undefined)) {
        normalizedUpdates.anthropicBaseUrl = normalize(updates.anthropicBaseUrl, DEFAULT_BASE_URLS.anthropic);
      }

      // If provider is changing, ensure defaults are present when no overrides supplied
      if (updates.apiProvider && updates.apiProvider !== currentConfig.apiProvider) {
        if (updates.apiProvider === "openai") {
          normalizedUpdates.openaiModel = sanitizeModelForProvider(
            normalize(updates.openaiModel, DEFAULT_MODELS.openai),
            "openai"
          );
          normalizedUpdates.openaiBaseUrl = normalize(updates.openaiBaseUrl, DEFAULT_BASE_URLS.openai);
        } else if (updates.apiProvider === "gemini") {
          normalizedUpdates.geminiModel = sanitizeModelForProvider(
            normalize(updates.geminiModel, DEFAULT_MODELS.gemini),
            "gemini"
          );
          normalizedUpdates.geminiBaseUrl = normalize(updates.geminiBaseUrl, DEFAULT_BASE_URLS.gemini);
        } else if (updates.apiProvider === "anthropic") {
          normalizedUpdates.anthropicModel = sanitizeModelForProvider(
            normalize(updates.anthropicModel, DEFAULT_MODELS.anthropic),
            "anthropic"
          );
          normalizedUpdates.anthropicBaseUrl = normalize(updates.anthropicBaseUrl, DEFAULT_BASE_URLS.anthropic);
        }
      }

      const newConfig = { ...currentConfig, ...normalizedUpdates };
      this.saveConfig(newConfig);

      const shouldEmit =
        updates.apiKey !== undefined ||
        updates.apiProvider !== undefined ||
        updates.openaiModel !== undefined ||
        updates.geminiModel !== undefined ||
        updates.anthropicModel !== undefined ||
        updates.openaiBaseUrl !== undefined ||
        updates.geminiBaseUrl !== undefined ||
        updates.anthropicBaseUrl !== undefined ||
        updates.language !== undefined;

      if (shouldEmit) {
        this.emit('config-updated', newConfig);
      }

      return newConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Check if the API key is configured
   */
  public hasApiKey(): boolean {
    const config = this.loadConfig();
    return !!config.apiKey && config.apiKey.trim().length > 0;
  }
  
  /**
   * Validate the API key format
   */
  public isValidApiKeyFormat(apiKey: string, provider?: "openai" | "gemini" | "anthropic" ): boolean {
    // If provider is not specified, attempt to auto-detect
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
        } else {
          provider = "openai";
        }
      } else {
        provider = "gemini";
      }
    }
    
    if (provider === "openai") {
      // Basic format validation for OpenAI API keys
      return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "gemini") {
      // Basic format validation for Gemini API keys (usually alphanumeric with no specific prefix)
      return apiKey.trim().length >= 10; // Assuming Gemini keys are at least 10 chars
    } else if (provider === "anthropic") {
      // Basic format validation for Anthropic API keys
      return /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    }

    return false;
  }
  
  /**
   * Get the stored opacity value
   */
  public getOpacity(): number {
    const config = this.loadConfig();
    return config.opacity !== undefined ? config.opacity : 1.0;
  }

  /**
   * Set the window opacity value
   */
  public setOpacity(opacity: number): void {
    // Ensure opacity is between 0.1 and 1.0
    const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
    this.updateConfig({ opacity: validOpacity });
  }  
  
  /**
   * Get the preferred programming language
   */
  public getLanguage(): string {
    const config = this.loadConfig();
    return config.language || "python";
  }

  /**
   * Set the preferred programming language
   */
  public setLanguage(language: string): void {
    this.updateConfig({ language });
  }
  
  /**
   * Test API key with the selected provider
   */
  public async testApiKey(apiKey: string, provider?: "openai" | "gemini" | "anthropic"): Promise<{valid: boolean, error?: string}> {
    // Auto-detect provider based on key format if not specified
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format for testing");
        } else {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format for testing");
        }
      } else {
        provider = "gemini";
        console.log("Using Gemini API key format for testing (default)");
      }
    }

    if (provider === "openai") {
      return this.testOpenAIKey(apiKey);
    } else if (provider === "gemini") {
      return this.testGeminiKey(apiKey);
    } else if (provider === "anthropic") {
      return this.testAnthropicKey(apiKey);
    }

    return { valid: false, error: "Unknown API provider" };
  }
  
  /**
   * Test OpenAI API key
   */
  private async testOpenAIKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      const config = this.loadConfig();
      const openai = new OpenAI({
        apiKey,
        baseURL: config.openaiBaseUrl || DEFAULT_BASE_URLS.openai,
        timeout: 15000
      });
      // Make a simple API call to test the key
      await openai.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error('OpenAI API key test failed:', error);
      
      // Determine the specific error type for better error messages
      let errorMessage = 'Unknown error validating OpenAI API key';
      
      if (error.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI key and try again.';
      } else if (error.status === 429) {
        errorMessage = 'Rate limit exceeded. Your OpenAI API key has reached its request limit or has insufficient quota.';
      } else if (error.status === 500) {
        errorMessage = 'OpenAI server error. Please try again later.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }
  
  /**
   * Test Gemini API key
   * Note: This is a simplified implementation since we don't have the actual Gemini client
   */
  private async testGeminiKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Gemini API and validate the key
      if (apiKey && apiKey.trim().length >= 20) {
        // Here you would actually validate the key with a Gemini API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Gemini API key format.' };
    } catch (error: any) {
      console.error('Gemini API key test failed:', error);
      let errorMessage = 'Unknown error validating Gemini API key';
      
      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Anthropic API key
   * Note: This is a simplified implementation since we don't have the actual Anthropic client
   */
  private async testAnthropicKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Anthropic API and validate the key
      if (apiKey && /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim())) {
        // Here you would actually validate the key with an Anthropic API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Anthropic API key format.' };
    } catch (error: any) {
      console.error('Anthropic API key test failed:', error);
      let errorMessage = 'Unknown error validating Anthropic API key';
      
      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }

}

// Export a singleton instance
export const configHelper = new ConfigHelper();
