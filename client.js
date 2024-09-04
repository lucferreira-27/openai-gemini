const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs').promises;
require('dotenv').config()
	;
const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;
// Configuration
const CONFIG = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    apiKey: OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  },
  gemini: {
    url: 'http://localhost:3000/v1/chat/completions',
    apiKey: GEMINI_API_KEY,
    model: 'gemini-1.5-flash-exp-0827'
  }
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "write_to_file",
      description: "Write content to a file",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "The name of the file to write to" },
          content: { type: "string", description: "The content to write to the file (can be HTML)" }
        },
        required: ["filename", "content"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "read_file",
      "description": "Read content from a file",
      "parameters": {
        "type": "object",
        "properties": {
          "filename": {
            "type": "string",
            "description": "The name of the file to read from"
          }
        },
        "required": ["filename"],
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "list_files",
      "description": "List files in a directory",
      "parameters": {
        "type": "object",
        "properties": {
          "directory": {
            "type": "string",
            "description": "The directory path to list files from"
          }
        },
        "required": ["directory"],
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "list_code_definition_names",
      "description": "List names of code definitions (functions, classes, etc.) in a file",
      "parameters": {
        "type": "object",
        "properties": {
          "filename": {
            "type": "string",
            "description": "The name of the file to analyze"
          }
        },
        "required": ["filename"],
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_files",
      "description": "Search for files containing specific text",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The text to search for in files"
          },
          "directory": {
            "type": "string",
            "description": "The directory to search in (optional)"
          }
        },
        "required": ["query"],
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "execute_command",
      "description": "Execute a system command",
      "parameters": {
        "type": "object",
        "properties": {
          "command": {
            "type": "string",
            "description": "The command to execute"
          }
        },
        "required": ["command"],
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "ask_followup_question",
      "description": "Ask a follow-up question to the user",
      "parameters": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "The follow-up question to ask"
          }
        },
        "required": ["question"],
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "attempt_completion",
      "description": "Attempt to complete a partial code snippet or text",
      "parameters": {
        "type": "object",
        "properties": {
          "partial_text": {
            "type": "string",
            "description": "The partial code or text to complete"
          }
        },
        "required": ["partial_text"],
        "additionalProperties": false
      }
    }
  }
];

const TEST_CASES = [
  { name: "write_to_file", content: "Write a simple HTML file named 'test.html' with a heading that says 'Hello, World!'" },
  { name: "read_file", content: "Read the contents of the file 'example.txt'." },
  { name: "list_files", content: "List all files in the current directory." },
  { name: "list_code_definition_names", content: "List all function and class names in 'main.py'." },
  { name: "search_files", content: "Search for files containing 'important' in the 'documents' folder." },
  { name: "execute_command", content: "Execute the command 'echo Hello, World!'." },
  { name: "ask_followup_question", content: "I'm thinking of a number between 1 and 10. Ask a follow-up question to guess it." },
  { name: "attempt_completion", content: "Complete this code: 'def factorial(n):'" }
];

// Logging utilities
const log = {
  info: (msg) => console.log(chalk.blue(`ℹ️ ${msg}`)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`⚠️ ${msg}`))
};

async function testFunctionCalling(provider) {
  log.info(`🚀 Testing ${provider}...`);
  
  const testResults = {};

  for (const testCase of TEST_CASES) {
    log.info(`🧪 Testing ${testCase.name}... content: ${testCase.content}`);
    
    let retries = 3;
    while (retries > 0) {
      try {
        const response = await axios.post(
          CONFIG[provider].url,
          {
            model: CONFIG[provider].model,
            messages: [{ role: "user", content: testCase.content }],
            tools: TOOLS,
            temperature: 0
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CONFIG[provider].apiKey}`
            }
          }
        );

        // Store the response
        testResults[testCase.name] = response.data;

        if (response.data.choices[0].message.tool_calls) {
          log.success(`✅ ${testCase.name} test passed for ${provider}`);
          break;  // Success, exit the retry loop
        } else {
          log.error(`❌ ${testCase.name} test failed for ${provider} (no tool calls)`);
          log.warn('Response: ' + JSON.stringify(response.data, null, 2));
          return { success: false, results: testResults };
        }
      } catch (error) {
        if (error.response && error.response.status === 429) {
          retries--;
          if (retries > 0) {
            log.warn(`⏳ Rate limit hit for ${provider}. Retrying in 5 seconds... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 5000));  // Wait for 5 seconds before retrying
          } else {
            log.error(`❌ ${testCase.name} test failed for ${provider} after multiple retries: ${error.message}`);
            testResults[testCase.name] = { error: error.message };
            return { success: false, results: testResults };
          }
        } else {
          log.error(`❌ Error in ${testCase.name} test for ${provider}: ${error.message}`);
          testResults[testCase.name] = { error: error.message };
          return { success: false, results: testResults };
        }
      }
    }
  }
  
  log.success(`🎉 All tests passed for ${provider}`);
  return { success: true, results: testResults };
}

async function runTests() {
  const results = {
    openai: await testFunctionCalling('openai'),
    gemini: await testFunctionCalling('gemini')
  };
  
  log.info('📊 Test Results Summary:');
  Object.entries(results).forEach(([provider, result]) => {
    if (result.success) {
      log.success(`${provider}: All tests passed 🚀`);
    } else {
      log.error(`${provider}: Some tests failed 😢`);
    }
  });

  // Save results to JSON file
  try {
    await fs.writeFile('test_results.json', JSON.stringify(results, null, 2));
    log.success('📁 Test results saved to test_results.json');
  } catch (error) {
    log.error(`❌ Error saving test results: ${error.message}`);
  }
}

runTests();
