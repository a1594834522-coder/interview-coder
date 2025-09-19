// ProcessingHelper.ts
import fs from "node:fs"
import path from "node:path"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import * as axios from "axios"
import { app, BrowserWindow, dialog } from "electron"
import { OpenAI } from "openai"
import { configHelper } from "./ConfigHelper"
import Anthropic from '@anthropic-ai/sdk';

// Interface for Gemini API requests
interface GeminiMessage {
  role: string;
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    }
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}
export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper
  private openaiClient: OpenAI | null = null
  private geminiApiKey: string | null = null
  private anthropicClient: Anthropic | null = null

  private extractJsonObject(raw: string): any | null {
    if (!raw) {
      return null;
    }
    const sanitized = raw.replace(/```json|```/g, '').trim();
    const candidates: string[] = [];
    if (sanitized.startsWith('{') || sanitized.startsWith('[')) {
      candidates.push(sanitized);
    }

    const firstBrace = sanitized.indexOf('{');
    if (firstBrace !== -1) {
      for (let end = sanitized.length - 1; end > firstBrace; end--) {
        if (sanitized[end] === '}') {
          candidates.push(sanitized.slice(firstBrace, end + 1));
        }
      }
    }

    const firstBracket = sanitized.indexOf('[');
    if (firstBracket !== -1) {
      for (let end = sanitized.length - 1; end > firstBracket; end--) {
        if (sanitized[end] === ']') {
          candidates.push(sanitized.slice(firstBracket, end + 1));
        }
      }
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch (err) {
        continue;
      }
    }
    return null;
  }

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()
    
    // Initialize AI client based on config
    this.initializeAIClient();
    
    // Listen for config changes to re-initialize the AI client
    configHelper.on('config-updated', () => {
      this.initializeAIClient();
    });
  }
  
  /**
   * Initialize or reinitialize the AI client with current config
   */
  private initializeAIClient(): void {
    try {
      const config = configHelper.loadConfig();
      
      if (config.apiProvider === "openai") {
        if (config.apiKey) {
          this.openaiClient = new OpenAI({ 
            apiKey: config.apiKey,
            timeout: 60000, // 60 second timeout
            maxRetries: 2   // Retry up to 2 times
          });
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.log("OpenAI client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, OpenAI client not initialized");
        }
      } else if (config.apiProvider === "gemini"){
        // Gemini client initialization
        this.openaiClient = null;
        this.anthropicClient = null;
        if (config.apiKey) {
          this.geminiApiKey = config.apiKey;
          console.log("Gemini API key set successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, Gemini client not initialized");
        }
      } else if (config.apiProvider === "anthropic") {
        // Reset other clients
        this.openaiClient = null;
        this.geminiApiKey = null;
        if (config.apiKey) {
          this.anthropicClient = new Anthropic({
            apiKey: config.apiKey,
            timeout: 60000,
            maxRetries: 2
          });
          console.log("Anthropic client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, Anthropic client not initialized");
        }
      }
    } catch (error) {
      console.error("Failed to initialize AI client:", error);
      this.openaiClient = null;
      this.geminiApiKey = null;
      this.anthropicClient = null;
    }
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getCredits(): Promise<number> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return 999 // Unlimited credits in this version

    try {
      await this.waitForInitialization(mainWindow)
      return 999 // Always return sufficient credits to work
    } catch (error) {
      console.error("Error getting credits:", error)
      return 999 // Unlimited credits as fallback
    }
  }

  private async getLanguage(): Promise<string> {
    try {
      // Get language from config
      const config = configHelper.loadConfig();
      if (config.language) {
        return config.language;
      }
      
      // Fallback to window variable if config doesn't have language
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        try {
          await this.waitForInitialization(mainWindow)
          const language = await mainWindow.webContents.executeJavaScript(
            "window.__LANGUAGE__"
          )

          if (
            typeof language === "string" &&
            language !== undefined &&
            language !== null
          ) {
            return language;
          }
        } catch (err) {
          console.warn("Could not get language from window", err);
        }
      }
      
      // Default fallback
      return "python";
    } catch (error) {
      console.error("Error getting language:", error)
      return "python"
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    const config = configHelper.loadConfig();
    
    // First verify we have a valid AI client
    if (config.apiProvider === "openai" && !this.openaiClient) {
      this.initializeAIClient();
      
      if (!this.openaiClient) {
        console.error("OpenAI client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "gemini" && !this.geminiApiKey) {
      this.initializeAIClient();
      
      if (!this.geminiApiKey) {
        console.error("Gemini API key not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "anthropic" && !this.anthropicClient) {
      // Add check for Anthropic client
      this.initializeAIClient();
      
      if (!this.anthropicClient) {
        console.error("Anthropic client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    }

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots:", screenshotQueue)
      
      // Check if the queue is empty
      if (!screenshotQueue || screenshotQueue.length === 0) {
        console.log("No screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      // Check that files actually exist
      const existingScreenshots = screenshotQueue.filter(path => fs.existsSync(path));
      if (existingScreenshots.length === 0) {
        console.log("Screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const screenshots = await Promise.all(
          existingScreenshots.map(async (path) => {
            try {
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )

        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data");
        }

        const result = await this.processScreenshotsHelper(validScreenshots, signal)

        if (!result.success) {
          console.log("Processing failed:", result.error)
          if (result.error?.includes("API Key") || result.error?.includes("OpenAI") || result.error?.includes("Gemini") || result.error?.includes("Anthropic")) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.API_KEY_INVALID
            )
          } else {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              result.error
            )
          }
          // Reset view back to queue on error
          console.log("Resetting view to queue due to error")
          this.deps.setView("queue")
          return
        }

        // Only set view to solutions if processing succeeded
        console.log("Setting view to solutions after successful processing")
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
        this.deps.setView("solutions")
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error
        )
        console.error("Processing error:", error)
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          )
        }
        // Reset view back to queue on error
        console.log("Resetting view to queue due to error")
        this.deps.setView("queue")
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      // view == 'solutions'
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)
      
      // Check if the extra queue is empty
      if (!extraScreenshotQueue || extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        
        return;
      }

      // Check that files actually exist
      const existingExtraScreenshots = extraScreenshotQueue.filter(path => fs.existsSync(path));
      if (existingExtraScreenshots.length === 0) {
        console.log("Extra screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }
      
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        // Get all screenshots (both main and extra) for processing
        const allPaths = [
          ...this.screenshotHelper.getScreenshotQueue(),
          ...existingExtraScreenshots
        ];
        
        const screenshots = await Promise.all(
          allPaths.map(async (path) => {
            try {
              if (!fs.existsSync(path)) {
                console.warn(`Screenshot file does not exist: ${path}`);
                return null;
              }
              
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )
        
        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data for debugging");
        }
        
        console.log(
          "Combined screenshots for processing:",
          validScreenshots.map((s) => s.path)
        )

        const result = await this.processExtraScreenshotsHelper(
          validScreenshots,
          signal
        )

        if (result.success) {
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const config = configHelper.loadConfig();
      const language = await this.getLanguage();
      const mainWindow = this.deps.getMainWindow();
      
      // Step 1: Extract problem info using AI Vision API (OpenAI or Gemini)
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      const extractionInstruction = `You are an interview task interpreter supporting coding, math, logical reasoning, reading comprehension, and analytical prompts.\nReturn ONLY valid JSON with the following fields:\n{\n  \"question_type\": \"coding | reading_comprehension | logical_reasoning | data_interpretation | math | other\",\n  \"problem_statement\": \"...\",\n  \"constraints\": \"...\",\n  \"example_input\": \"...\",\n  \"example_output\": \"...\",\n  \"answer_expectations\": \"...\",\n  \"supporting_material\": \"...\",\n  \"evaluation_focus\": \"...\",\n  \"language_hint\": \"...\"\n}\nRules:\n- Use complete sentences when summarizing textual prompts.\n- Use \"N/A\" if a field is not provided.\n- Set \"language_hint\" to the requested programming language. If the task is not coding or no language is specified, set it to \"N/A\".\n- Do not include markdown code fences or commentary outside of the JSON body.`;
      const extractionUserPrompt = `Analyze the uploaded screenshots and populate the schema above. The user's preferred coding language is ${language}. Respect any language explicitly requested in the task.`;

      let problemInfo: any | null = null;

      
      if (config.apiProvider === "openai") {
        // Verify OpenAI client
        if (!this.openaiClient) {
          this.initializeAIClient(); // Try to reinitialize
          
          if (!this.openaiClient) {
            return {
              success: false,
              error: "OpenAI API key not configured or invalid. Please check your settings."
            };
          }
        }

        // Use OpenAI for processing
        const messages = [
          {
            role: "system" as const, 
            content: extractionInstruction
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const, 
                text: extractionUserPrompt
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        // Send to OpenAI Vision API
        const extractionResponse = await this.openaiClient.chat.completions.create({
          model: config.extractionModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2
        });

        // Parse the response
        try {
          const responseText = extractionResponse.choices[0].message.content;
          // Handle when OpenAI might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error) {
          console.error("Error parsing OpenAI response:", error);
          return {
            success: false,
            error: "Failed to parse problem information. Please try again or use clearer screenshots."
          };
        }
      } else if (config.apiProvider === "gemini")  {
        // Single-call Gemini workflow (Vision + Answer)
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }

        try {
          const instruction = `请阅读我接下来提供的题目截图：
1) 如果是单选题：只需在第一行输出“最终答案：A/B/C/D”中的一个字母；第二行用不超过20个字解释原因。
2) 如果是代码题：直接给出完整、可运行、通过常见边界案例的代码。使用题面或常规默认语言；如题面未指定，优先使用 ${language}。请用 Markdown 代码块标注语言，例如 \`\`\`${language}\n...\`\`\`。解释尽量简短。
3) 不要输出JSON，也不要多余前言。`;

          const body: any = {
            contents: [
              {
                role: "user",
                parts: [
                  ...imageDataList.map((data) => ({ inlineData: { mimeType: "image/png", data } })),
                  { text: instruction }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              topP: 0.9,
              maxOutputTokens: 8192
            }
          };

          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.extractionModel || "gemini-2.5-flash"}:generateContent?key=${this.geminiApiKey}`,
            body,
            { signal }
          );

          const candidates = (response.data?.candidates || []) as any[];
          console.log("Gemini API response:", JSON.stringify(response.data, null, 2));

          if (!candidates.length) {
            const block = response.data?.promptFeedback?.blockReason || "no-candidates";
            throw new Error(`Empty response from Gemini API (${block})`);
          }

          const firstCandidate = candidates[0];

          // 处理MAX_TOKENS或其他finishReason的情况
          if (firstCandidate.finishReason === 'MAX_TOKENS') {
            console.warn("Gemini response truncated due to MAX_TOKENS limit");
          }

          const content = firstCandidate?.content;
          const parts = content?.parts || [];

          if (!parts || parts.length === 0) {
            console.error("Gemini response structure:", response.data);
            throw new Error("Gemini response: content.parts is empty or missing");
          }

          const partsText: string[] = [];
          for (const p of parts) {
            if (typeof p?.text === 'string') {
              const text = p.text.trim();
              if (text || firstCandidate.finishReason === 'MAX_TOKENS') {
                partsText.push(text);
              }
            }
          }

          const fullText = partsText.join('\n').trim();
          console.log("Extracted Gemini text length:", fullText.length);

          if (!fullText && firstCandidate.finishReason !== 'MAX_TOKENS') {
            console.error("Gemini response missing text, finishReason:", firstCandidate.finishReason);
            throw new Error("Gemini response missing text");
          }

          // 判断是否为代码题（含代码块）
          const codeBlockMatch = fullText.match(/```([a-zA-Z0-9+#-_]*)\n([\s\S]*?)```/);
          let formattedResponse: any;
          if (codeBlockMatch) {
            const codeLang = codeBlockMatch[1] || language;
            const code = codeBlockMatch[2].trim();
            formattedResponse = {
              answer_type: "code" as const,
              content: code,
              code,
              question_type: "coding",
              thoughts: ["依据题意给出可运行实现"],
              time_complexity: undefined,
              space_complexity: undefined
            };
          } else {
            // 选择题：提取答案字母
            let letter = null as string | null;
            const m1 = fullText.match(/(?:最终答案|答案)[:：]?\s*([ABCD])/i);
            if (m1) letter = m1[1].toUpperCase();
            if (!letter) {
              const lines = fullText.split(/\r?\n/).map(s => s.trim());
              const solo = lines.find(l => /^[ABCD]$/.test(l));
              if (solo) letter = solo;
            }
            formattedResponse = {
              answer_type: "analysis" as const,
              content: fullText,
              final_answer: letter || undefined,
              question_type: "multiple_choice",
              thoughts: undefined,
              key_takeaways: letter ? [`正确选项：${letter}`] : undefined
            };
          }

          let reasoningSteps: string[] = ["根据题意提供解决方案"];
          const qtype = codeBlockMatch ? "coding" : (formattedResponse.final_answer ? "multiple_choice" : "other");

          problemInfo = {
            question_type: qtype,
            problem_statement: "题目来自截图内容",
            constraints: "N/A",
            example_input: "N/A",
            example_output: "N/A",
            answer_expectations: qtype.includes("code") ? "提供可运行且正确的代码" : "回答选择题并提供理由",
            supporting_material: "N/A",
            evaluation_focus: "答案准确性",
            language_hint: "N/A",
            final_answer: formattedResponse.final_answer || "N/A",
            final_explanation: "已通过模型分析处理",
            reasoning_steps: reasoningSteps
          };

          this.deps.setProblemInfo(problemInfo);

          if (mainWindow) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
              problemInfo
            );
            mainWindow.webContents.send("processing-status", {
              message: "Gemini 2.5 Flash 已完成分析并生成答案",
              progress: 100
            });
          }

          this.screenshotHelper.clearExtraScreenshotQueue();

          return { success: true, data: formattedResponse };
        } catch (error: any) {
          const detail = error?.response?.data?.error?.message || error?.message;
          console.error("Error using Gemini API:", detail || error);
          const message = detail || "Failed to process with Gemini API. Please check your API key or try again later.";
          if (mainWindow) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              message
            );
          }
          return {
            success: false,
            error: message
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }

        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: extractionInstruction
                },
                {
                  type: "text" as const,
                  text: extractionUserPrompt
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: data
                  }
                }))
              ]
            }
          ];

          const response = await this.anthropicClient.messages.create({
            model: config.extractionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });

          const responseText = (response.content[0] as { type: 'text', text: string }).text;
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error: any) {
          console.error("Error using Anthropic API:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }

          return {
            success: false,
            error: "Failed to process with Anthropic API. Please check your API key or try again later."
          };
        }
      }

      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Problem analyzed successfully. Preparing to generate solution...",
          progress: 40
        });
      }

      // Store problem info in AppState
      this.deps.setProblemInfo(problemInfo);

      // Send first success event
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        );

        // Generate solutions after successful extraction
        const solutionsResult = await this.generateSolutionsHelper(signal);
        if (solutionsResult.success) {
          // Clear any existing extra screenshots before transitioning to solutions view
          this.screenshotHelper.clearExtraScreenshotQueue();
          
          // Final progress update
          mainWindow.webContents.send("processing-status", {
            message: "Solution generated successfully",
            progress: 100
          });
          
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          );
          return { success: true, data: solutionsResult.data };
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          );
        }
      }

      return { success: false, error: "Failed to process screenshots" };
    } catch (error: any) {
      // If the request was cancelled, don't retry
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      // Handle OpenAI API errors specifically
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
        };
      } else if (error?.response?.status === 500) {
        return {
          success: false,
          error: "OpenAI server error. Please try again later."
        };
      }

      console.error("API Error Details:", error);
      return { 
        success: false, 
        error: error.message || "Failed to process screenshots. Please try again." 
      };
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      let problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      if (config.apiProvider === "gemini" && problemInfo.final_answer) {
        const finalAnswer = (problemInfo.final_answer as string).toUpperCase();
        const reasoningSteps: string[] = Array.isArray(problemInfo.reasoning_steps)
          ? (problemInfo.reasoning_steps as string[])
          : [];
        const finalExplanation = problemInfo.final_explanation || "确保依据题干选择最合理的选项";

        const formattedResponse = {
          answer_type: "analysis" as const,
          content: `最终答案：${finalAnswer}\n理由：${finalExplanation}`,
          final_answer: finalAnswer,
          question_type: problemInfo.question_type || "multiple_choice",
          thoughts: reasoningSteps.length > 0 ? reasoningSteps : ["模型依据截图给出答案"],
          key_takeaways: [
            `正确选项：${finalAnswer}`,
            finalExplanation
          ]
        };

        return { success: true, data: formattedResponse };
      }

      // Update progress status
      // Create prompt for solution generation
      const questionTypeRaw = (problemInfo.question_type || "coding").toString().toLowerCase();
      const normalizedQuestionType = questionTypeRaw.replace(/_/g, " ");
      const isCodingTask = questionTypeRaw.includes("code");

      const hasValue = (value: unknown): value is string =>
        typeof value === "string" && value.trim() !== "" && value.trim().toLowerCase() !== "n/a";

      const constraintsText = hasValue(problemInfo.constraints)
        ? problemInfo.constraints
        : "No specific constraints provided.";
      const exampleInputText = hasValue(problemInfo.example_input)
        ? problemInfo.example_input
        : "No example input provided.";
      const exampleOutputText = hasValue(problemInfo.example_output)
        ? problemInfo.example_output
        : "No example output provided.";

      const answerExpectations = hasValue(problemInfo.answer_expectations)
        ? problemInfo.answer_expectations
        : isCodingTask
          ? "Provide the most accurate and efficient solution."
          : "Provide the most accurate and complete answer.";
      const supportingMaterial = hasValue(problemInfo.supporting_material)
        ? problemInfo.supporting_material
        : "N/A";
      const evaluationFocus = hasValue(problemInfo.evaluation_focus)
        ? problemInfo.evaluation_focus
        : "Clarity, correctness, and coverage of key points.";

      const supportingMaterialBlock = supportingMaterial !== "N/A"
        ? `SUPPORTING MATERIAL:
${supportingMaterial}

`
        : "";

      const codingPrompt = `
Please respond in Simplified Chinese for all narrative sections while keeping the source code in ${language}.

Generate a detailed solution for the following coding problem:

QUESTION TYPE: ${normalizedQuestionType}
PROBLEM STATEMENT:
${problemInfo.problem_statement}

CONSTRAINTS:
${constraintsText}

EXAMPLE INPUT:
${exampleInputText}

EXAMPLE OUTPUT:
${exampleOutputText}

ANSWER EXPECTATIONS:
${answerExpectations}

${supportingMaterialBlock}EVALUATION FOCUS:
${evaluationFocus}

LANGUAGE: ${language}

Respond with (headings may stay in English, but the content under each heading must be in Simplified Chinese):
1. Code: Provide a clean, optimized implementation in ${language}
2. Your Thoughts: List key insights and reasoning behind your approach in Simplified Chinese
3. Time complexity: Give Big-O notation plus a detailed (2+ sentence) explanation in Simplified Chinese
4. Space complexity: Give Big-O notation plus a detailed (2+ sentence) explanation in Simplified Chinese

Ensure the solution handles edge cases and includes brief inline comments in ${language} if useful.
`;

      const generalPrompt = `
Please answer entirely in Simplified Chinese while retaining the section headings below.

Task type: ${normalizedQuestionType}
PROMPT:
${problemInfo.problem_statement}

ANSWER EXPECTATIONS:
${answerExpectations}

${supportingMaterialBlock}EVALUATION FOCUS:
${evaluationFocus}

Respond in Markdown with these exact sections (content in Simplified Chinese):

### Final Answer
Provide the polished answer or recommendation in a few focused sentences, written in Simplified Chinese.

### Reasoning Steps
List numbered steps that show how you reached the answer in Simplified Chinese, citing any supporting material.

### Key Takeaways
Provide 3 concise bullet points in Simplified Chinese highlighting what the candidate should remember.

Keep the tone professional and align your answer with the evaluation focus.
`;

      const systemPrompt = isCodingTask
        ? "You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations."
        : `You are an interview assistant specialized in ${normalizedQuestionType} tasks. Provide rigorous yet concise answers grounded in the available information.`;

      const userPrompt = isCodingTask ? codingPrompt : generalPrompt;

      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: isCodingTask
            ? "Creating optimal solution with detailed explanations..."
            : "Formulating a structured interview response...",
          progress: 60
        });
      }

      let responseContent;

      
      if (config.apiProvider === "openai") {
        // OpenAI processing
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        // Send to OpenAI API
        const solutionResponse = await this.openaiClient.chat.completions.create({
          model: config.solutionModel || "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 4000,
          temperature: 0.2
        });

        responseContent = solutionResponse.choices[0].message.content;
      } else if (config.apiProvider === "anthropic") {
        // Anthropic processing
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `${systemPrompt}

${userPrompt}`
                }
              ]
            }
          ];

          // Send to Anthropic API
          const response = await this.anthropicClient.messages.create({
            model: config.solutionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });

          responseContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for solution:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }

          return {
            success: false,
            error: "Failed to generate solution with Anthropic API. Please check your API key or try again later."
          };
        }
      }
      
      if (problemInfo) {

        const defaultProblemInfo = {

          question_type: 'coding',

          constraints: 'N/A',

          example_input: 'N/A',

          example_output: 'N/A',

          answer_expectations: 'N/A',

          supporting_material: 'N/A',

          evaluation_focus: 'N/A',

          language_hint: 'N/A'

        };



        const normalizedProblemInfo = {

          ...defaultProblemInfo,

          ...(problemInfo ?? {})

        };



        if (typeof normalizedProblemInfo.question_type === 'string') {

          normalizedProblemInfo.question_type = normalizedProblemInfo.question_type.toLowerCase();

        } else {

          normalizedProblemInfo.question_type = 'coding';

        }



        if (typeof normalizedProblemInfo.language_hint !== 'string' || normalizedProblemInfo.language_hint.trim() === '') {

          normalizedProblemInfo.language_hint = language;

        }



        if (!normalizedProblemInfo.answer_expectations || normalizedProblemInfo.answer_expectations.trim() === '' || normalizedProblemInfo.answer_expectations.trim().toLowerCase() === 'n/a') {

          normalizedProblemInfo.answer_expectations = normalizedProblemInfo.question_type.includes('code')

            ? 'Provide the most accurate and efficient solution.'

            : 'Provide the most accurate and complete answer.';

        }



        problemInfo = normalizedProblemInfo;

      }



      if (mainWindow) {

        mainWindow.webContents.send('processing-status', {

          message: 'Analyzing problem from screenshots...',

          progress: 20

        });

      }



      // Extract parts from the response

      // Extract parts from the response
      if (!responseContent) {
        throw new Error("No content returned from the model");
      }

      if (!isCodingTask) {

        const normalizedContent = responseContent.replace(/\r\n/g, '\n');

        const finalAnswerSection = normalizedContent.match(/###\s*Final Answer\s*([\s\S]*?)(?=###|$)/i);

        const reasoningSection = normalizedContent.match(/###\s*Reasoning Steps\s*([\s\S]*?)(?=###|$)/i);

        const takeawaysSection = normalizedContent.match(/###\s*Key Takeaways\s*([\s\S]*?)(?=###|$)/i);



        const toList = (section: RegExpMatchArray | null): string[] => {

          if (!section || !section[1]) {

            return [];

          }



          const candidateLines = section[1]

            .split('\n')

            .map((line) => line.trim())

            .filter(Boolean);



          const bulletLines = candidateLines

            .filter((line) => /^([-*?]|\d+\.)\s+/.test(line))

            .map((line) => line.replace(/^([-*?]|\d+\.)\s+/, ''));



          return bulletLines.length > 0 ? bulletLines : candidateLines;

        };



        const reasoningSteps = toList(reasoningSection);

        const keyTakeaways = toList(takeawaysSection);

        const finalAnswer = finalAnswerSection && finalAnswerSection[1]

          ? finalAnswerSection[1].trim()

          : normalizedContent.trim();



        const analysisResponse = {

          answer_type: 'analysis' as const,

          content: finalAnswer,

          code: finalAnswer,

          thoughts: reasoningSteps.length > 0

            ? reasoningSteps

            : ['Reasoning steps derived from the model response.'],

          time_complexity: 'N/A - Not a coding task',

          space_complexity: 'N/A - Not a coding task',

          key_takeaways: keyTakeaways.length > 0 ? keyTakeaways : undefined,

          question_type: normalizedQuestionType

        };



        return { success: true, data: analysisResponse };

      }



      const normalizedContent = responseContent.replace(/\r\n/g, '\n');

      const codeMatch = normalizedContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);

      const code = codeMatch ? codeMatch[1].trim() : normalizedContent;



      // Extract thoughts, looking for bullet points or numbered lists

      const thoughtsRegex = /(?:Thoughts:|Key Insights:|Reasoning:|Approach:)([\s\S]*?)(?:Time complexity:|$)/i;

      const thoughtsMatch = normalizedContent.match(thoughtsRegex);

      let thoughts: string[] = [];



      if (thoughtsMatch && thoughtsMatch[1]) {

        const candidateLines = thoughtsMatch[1]

          .split('\n')

          .map((line) => line.trim())

          .filter(Boolean);



        const bulletLines = candidateLines

          .filter((line) => /^([-*?]|\d+\.)\s+/.test(line))

          .map((line) => line.replace(/^([-*?]|\d+\.)\s+/, ''));



        thoughts = bulletLines.length > 0 ? bulletLines : candidateLines;

      }

      const timeComplexityPattern = /Time complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:Space complexity|$))/i;

      const spaceComplexityPattern = /Space complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:[A-Z]|$))/i;

      let timeComplexity = "O(n) - Linear time complexity because we only iterate through the array once. Each element is processed exactly one time, and the hashmap lookups are O(1) operations.";
      let spaceComplexity = "O(n) - Linear space complexity because we store elements in the hashmap. In the worst case, we might need to store all elements before finding the solution pair.";

      const timeMatch = normalizedContent.match(timeComplexityPattern);
      if (timeMatch && timeMatch[1]) {
        timeComplexity = timeMatch[1].trim();
        if (!timeComplexity.match(/O\([^)]+\)/i)) {
          timeComplexity = `O(n) - ${timeComplexity}`;
        } else if (!timeComplexity.includes('-') && !timeComplexity.includes('because')) {
          const notationMatch = timeComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = timeComplexity.replace(notation, '').trim();
            timeComplexity = `${notation} - ${rest}`;
          }
        }
      }

      const spaceMatch = normalizedContent.match(spaceComplexityPattern);
      if (spaceMatch && spaceMatch[1]) {
        spaceComplexity = spaceMatch[1].trim();
        if (!spaceComplexity.match(/O\([^)]+\)/i)) {
          spaceComplexity = `O(n) - ${spaceComplexity}`;
        } else if (!spaceComplexity.includes('-') && !spaceComplexity.includes('because')) {
          const notationMatch = spaceComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = spaceComplexity.replace(notation, '').trim();
            spaceComplexity = `${notation} - ${rest}`;
          }
        }
      }

      const formattedResponse = {
        answer_type: "code" as const,
        content: code,
        code: code,
        thoughts: thoughts.length > 0 ? thoughts : ["Solution approach based on efficiency and readability"],
        time_complexity: timeComplexity,
        space_complexity: spaceComplexity,
        key_takeaways: undefined,
        question_type: normalizedQuestionType
      };

      return { success: true, data: formattedResponse };

    } catch (error: any) {
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
        };
      }
      
      console.error("Solution generation error:", error);
      return { success: false, error: error.message || "Failed to generate solution" };
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Processing debug screenshots...",
          progress: 30
        });
      }

      // Prepare the images for the API call
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      
      let debugContent;
      
      if (config.apiProvider === "openai") {
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        const messages = [
          {
            role: "system" as const, 
            content: `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).`
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const, 
                text: `I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. What issues you found in my code
2. Specific improvements and corrections
3. Any optimizations that would make the solution better
4. A clear explanation of the changes needed` 
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Analyzing code and generating debug feedback...",
            progress: 60
          });
        }

        const debugResponse = await this.openaiClient.chat.completions.create({
          model: config.debuggingModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2
        });
        
        debugContent = debugResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini")  {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }
        
        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).
`;

          const geminiMessages = [
            {
              role: "user",
              parts: [
                { text: debugPrompt },
                ...imageDataList.map(data => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data
                  }
                }))
              ]
            }
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Gemini...",
              progress: 60
            });
          }

          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.debuggingModel || "gemini-2.5-flash"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192
              }
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;

          if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error("Empty response from Gemini API");
          }

          const firstCandidate = responseData.candidates[0];

          if (!firstCandidate.content || !firstCandidate.content.parts ||
              firstCandidate.content.parts.length === 0) {
            throw new Error("Gemini response content.parts is empty or missing");
          }

          debugContent = firstCandidate.content.parts[0].text || "";

          if (!debugContent.trim()) {
            throw new Error("Gemini response missing text content");
          }
        } catch (error) {
          console.error("Error using Gemini API for debugging:", error);
          return {
            success: false,
            error: "Failed to process debug request with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification.
`;

          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: debugPrompt
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const, 
                    data: data
                  }
                }))
              ]
            }
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Claude...",
              progress: 60
            });
          }

          const response = await this.anthropicClient.messages.create({
            model: config.debuggingModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });
          
          debugContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for debugging:", error);
          
          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }
          
          return {
            success: false,
            error: "Failed to process debug request with Anthropic API. Please check your API key or try again later."
          };
        }
      }
      
      
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Debug analysis complete",
          progress: 100
        });
      }

      let extractedCode = "// Debug mode - see analysis below";
      const codeMatch = debugContent.match(/```(?:[a-zA-Z]+)?([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        extractedCode = codeMatch[1].trim();
      }

      let formattedDebugContent = debugContent;
      
      if (!debugContent.includes('# ') && !debugContent.includes('## ')) {
        formattedDebugContent = debugContent
          .replace(/issues identified|problems found|bugs found/i, '## Issues Identified')
          .replace(/code improvements|improvements|suggested changes/i, '## Code Improvements')
          .replace(/optimizations|performance improvements/i, '## Optimizations')
          .replace(/explanation|detailed analysis/i, '## Explanation');
      }

      const bulletPoints = formattedDebugContent.match(/(?:^|\n)[ ]*(?:[-*•]|\d+\.)[ ]+([^\n]+)/g);
      const thoughts = bulletPoints 
        ? bulletPoints.map(point => point.replace(/^[ ]*(?:[-*•]|\d+\.)[ ]+/, '').trim()).slice(0, 5)
        : ["Debug analysis based on your screenshots"];
      
      const response = {
        code: extractedCode,
        debug_analysis: formattedDebugContent,
        thoughts: thoughts,
        time_complexity: "N/A - Debug mode",
        space_complexity: "N/A - Debug mode"
      };

      return { success: true, data: response };
    } catch (error: any) {
      console.error("Debug processing error:", error);
      return { success: false, error: error.message || "Failed to process debug request" };
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    this.deps.setHasDebugged(false)

    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }
}
