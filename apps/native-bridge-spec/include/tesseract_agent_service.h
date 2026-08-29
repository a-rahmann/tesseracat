#ifndef TESSERACT_AGENT_SERVICE_H_
#define TESSERACT_AGENT_SERVICE_H_

#include <string>
#include <vector>
#include <memory>
#include <functional>

namespace tesseract {

struct PageContext {
  std::string url;
  std::string title;
  std::string visible_text;
  std::string accessibility_tree_json;
  int tab_id;
};

struct PolicyCheckRequest {
  std::string category;
  std::string tool_name;
  std::string parameters_json;
  std::string profile_id;
};

struct PolicyCheckResponse {
  bool allowed;
  bool requires_user_approval;
  bool requires_user_takeover;
  std::string risk_level;
  std::string reason;
};

class TesseractAgentService {
 public:
  TesseractAgentService() = default;
  virtual ~TesseractAgentService() = default;

  // Browser state observation
  virtual PageContext GetActivePageContext(int tab_id) = 0;
  virtual std::vector<PageContext> GetAllOpenTabs() = 0;

  // Native policy boundary verification
  virtual PolicyCheckResponse VerifyPolicy(const PolicyCheckRequest& request) = 0;

  // Internal extension IPC registration
  virtual void RegisterComponentExtensionBinding(const std::string& extension_id) = 0;

  // Controlled browser actions
  virtual bool NavigateTab(int tab_id, const std::string& target_url) = 0;
  virtual bool CloseTab(int tab_id) = 0;
  virtual bool FocusTab(int tab_id) = 0;
};

}  // namespace tesseract

#endif  // TESSERACT_AGENT_SERVICE_H_
