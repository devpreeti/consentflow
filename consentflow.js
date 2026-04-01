(function () {
  function initConsentFlow() {

    const consent = localStorage.getItem("cf_consent");

    function activateScripts() {
      const scripts = document.querySelectorAll('script[type="text/plain"]');

      scripts.forEach((script) => {
        const newScript = document.createElement("script");
        newScript.textContent = script.textContent;
        document.body.appendChild(newScript);
      });
    }

if (consent) {
  try {
    const parsed = JSON.parse(consent);
    if (parsed.analytics) {
      activateScripts();
    }
  } catch {
    if (consent === "accepted") {
      activateScripts();
    }
  }
  return;
}

  if (!consent) {
    const banner = document.createElement("div");
banner.innerHTML = `
  <div style="
    position: fixed;
    bottom: 20px;
    left: 20px;
    max-width: 400px;
    background: #1f2937;
    color: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    font-family: Arial, sans-serif;
    z-index: 9999;
  ">
    <h3 style="margin: 0 0 10px;">We value your privacy</h3>
    <p style="font-size: 14px;">
      We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic.
    </p>

    <div style="margin-top: 15px;">
      <button id="acceptBtn" style="
        background: #10b981;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        margin-right: 5px;
        cursor: pointer;
      ">Accept All</button>

      <button id="rejectBtn" style="
        background: #ef4444;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        margin-right: 5px;
        cursor: pointer;
      ">Reject</button>

      <button id="customizeBtn" style="
        background: transparent;
        color: #9ca3af;
        border: none;
        cursor: pointer;
      ">Customize</button>
    </div>
  </div>
`;

    document.body.appendChild(banner);
    const modal = document.createElement("div");
modal.innerHTML = `
  <div id="cf_modal" style="
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.6);
    z-index: 10000;
  ">
    <div style="
      background: white;
      color: black;
      max-width: 400px;
      margin: 100px auto;
      padding: 20px;
      border-radius: 10px;
    ">
      <h3>Privacy Preferences</h3>

      <label>
        <input type="checkbox" checked disabled />
        Necessary (Always Active)
      </label><br/><br/>

      <label>
        <input type="checkbox" id="analyticsToggle" />
        Analytics
      </label><br/><br/>

      <button id="savePreferences">Save Preferences</button>
    </div>
  </div>
`;

document.body.appendChild(modal);

document.getElementById("customizeBtn").onclick = function () {
  document.getElementById("cf_modal").style.display = "block";
};

document.getElementById("savePreferences").onclick = function () {
  const analytics = document.getElementById("analyticsToggle").checked;

  localStorage.setItem("cf_consent", JSON.stringify({
    analytics: analytics
  }));

  location.reload();
};

    document.getElementById("acceptBtn").onclick = function () {
      localStorage.setItem("cf_consent", "accepted");
      location.reload();
    };

    document.getElementById("rejectBtn").onclick = function () {
      localStorage.setItem("cf_consent", "rejected");
      location.reload();
    };
  }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initConsentFlow);
  } else {
    initConsentFlow();
  }
})();