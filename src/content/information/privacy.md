---
slug: privacy
title: Privacy Policy | PromptSpend
description: How PromptSpend handles pasted text, local app data, website analytics and cookies, pricing requests, app updates, sharing, alerts, and support messages.
heading: Privacy Policy
updated: 2026-10-29
---

PromptSpend is designed to estimate AI costs without turning your prompts into our data. This policy covers the PromptSpend native apps, website, pricing API, and optional alert and support services.

## The short version

The native app has no account system, advertising SDK, behavioral analytics, cross-app tracking, or tracking identifier. The random installation code its update check carries, described under App updates, is not read, logged, or stored by PromptSpend and is not used to identify you. Text pasted into the estimator is processed on your device. PromptSpend does not transmit or save that pasted text. You choose whether to share a result, and shared results contain derived counts and costs rather than the pasted text. If you opt into email alerts, the app sends the email address and alert choices you enter to the PromptSpend alert service solely to provide and secure that feature.

The website, promptspend.com, is different in one way: it uses Google Analytics, which sets cookies, to count visits, with Google's advertising features switched on. Google receives the full address of the page you are on, including your scenario, and a scrambled (hashed) copy of an email address you enter in the price-alert form, but never text you paste. You can turn it off; see Website visit statistics.

## Information that stays on your device

The native app may store appearance choices, onboarding state, saved scenarios, watched models, and a time-limited copy of the public pricing catalog. Saved scenarios contain model choices, numeric workload values, scale, and cost assumptions. They do not contain pasted prompt or response text. You can remove saved scenarios in the app; uninstalling the app removes its local app data subject to the operating system's normal backup and deletion behavior.

On the website, prompt text is processed in the browser, including on the token counter page, which counts the text on your device and sends it nowhere. PromptSpend does not place raw pasted text in shared links or browser storage. PromptSpend's own code stores only interface preferences in your browser: your theme, accent and background choices, whether you dismissed the welcome and apps banners, and your answer to the Google Analytics notice. The cookies the website sets are Google Analytics' own, described below. The page address always mirrors your current scenario, meaning the models you chose and numeric workload values, so that a link can recreate it, and Google Analytics receives it. It never contains your text.

## Network requests

The native app uses encrypted HTTPS requests to download PromptSpend's public pricing catalog and source-check status. These requests do not include your pasted text, saved scenarios, contacts, advertising identifier, or precise location. Like other internet services, hosting and network providers may process ordinary connection information, such as an IP address, request time, and user agent, to deliver and secure the service. PromptSpend does not use that information to build advertising profiles or track activity across apps or websites.

The website's footer shows a badge for PromptSpend's listing on LaunchNest, a product directory. That one image is loaded from launchnest.io, so your browser contacts LaunchNest's server when a page loads, which tells it your IP address and browser type. It is requested without telling LaunchNest which page you were on, and it sets no cookies.

## Website visit statistics

The website, promptspend.com, counts visits in two ways, so we can see which pages are read and which sites send visitors. Neither runs in the native apps, the VS Code extension, the MCP server, or the pricing API at promptspend.dev, which contain no analytics. When an app opens a page of the website for you, such as this policy or the Receipt page, it opens in a browser view and is the website, so the notice and Google Analytics apply there as they do in any browser.

**Google Analytics.** Each page of the website loads Google Analytics from www.googletagmanager.com, with Google's advertising and measurement features switched on. Google Analytics loads when a page opens, and a notice at the foot of the page says so until you choose OK or Turn off. It sets two cookies on promptspend.com, named `_ga` and `_ga_P27XJ53BH9`, which hold a random identifier so that Google can tell a returning browser from a new one; they last up to two years after your last visit. Google receives:

- the full address of the page you are on, including anything after a question mark or a hash sign, such as your scenario (the models you chose and the numbers you entered) and any campaign tags on the link you followed, and the address of the page you came from as your browser reports it, except the private key a price-alert link carries, which PromptSpend's code removes from the address before Google Analytics starts
- the page's title, your browser, device type and model, screen size and language, and an approximate location, such as your city or country, that Google works out from your connection
- how long the page is open, and events Google measures on the page itself: how far you scroll, which links to other sites you click, file downloads, video plays, each change of the page address as you use the calculator, and when you start or submit a form

Google never receives text you paste: it is processed on your device, never placed in the page address, and never passed on by PromptSpend's code. Google signals and ad personalization are switched on, so Google may link these visits to the Google account of a visitor who is signed in and has ad personalization turned on in that account, use them for reports on visitors' ages, genders and interests, and use them for advertising, including building audiences that advertisers can reach with Google's ad products. Our account also has Google's user-provided data collection switched on: when you enter an email address in the price-alert form, Google's code on the page detects it, scrambles it with a one-way hash, and sends the hashed form to Google, which can use it to match your visits to a Google account for measurement and advertising. Our Google Analytics account also shares data with Google to improve Google's products and services (under Google's controller-to-controller data protection terms, which make Google responsible for its own use of that data), and for benchmarking, technical support and recommendations. Google says Google Analytics does not log or store IP addresses. Our account keeps visit-level data for 14 months, the longest setting Google offers, extended each time a returning visitor comes back. Google processes the data under its own terms, explained at [How Google uses information from sites that use its services](https://policies.google.com/technologies/partner-sites); you can control how Google uses your activity for ads at [myadcenter.google.com](https://myadcenter.google.com).

To turn Google Analytics off in your browser, choose Turn off on the notice or use the control below; PromptSpend remembers that choice in your browser and deletes Google Analytics' cookies. If your browser sends Global Privacy Control, Google Analytics does not load at all. Google also offers an opt-out add-on for every site, at [tools.google.com/dlpage/gaoptout](https://tools.google.com/dlpage/gaoptout), and blocking cookies for promptspend.com stops Google from recognizing a returning browser, though on its own it may not stop a visit being counted. Clearing this site's data brings the notice back.

[[analytics-choice]]

**Cloudflare Web Analytics.** Each page also loads a small script from static.cloudflareinsights.com that reports the page's address without anything after a question mark or a hash sign, the referring site, your browser and device type, your country, and how quickly the page loaded, along with an identifier for that single page load. It sets no cookies and uses no local storage. Its reports are totals, not individual visits.

Neither service ever reads text you paste into the estimator, and PromptSpend never places pasted text in a page address. The website is hosted by GitHub Pages and served through Cloudflare, so both process ordinary connection information, such as an IP address, when a page is requested, as any host does.

## App updates

App versions that support it check PromptSpend's own update server, updates.promptspend.dev, each time they open, so a fix to the app's own code can arrive without waiting for a new store release. The request says which platform (iPhone or Android) and which app version you have. The update software the app is built with, Expo's open-source expo-updates library, also adds a random installation code it generates on your device and, if an earlier update failed to start, that error message. The update server does not read, log, or store the installation code or error messages; its request logging is switched off, and no third party receives these requests. Cloudflare hosts the server in the same way it hosts the rest of PromptSpend. Every update is digitally signed, and the app refuses to run an update that PromptSpend did not sign.

## Sharing and external links

When you tap a share or export action, PromptSpend hands the previewed result or file to the operating system's share sheet. The destination you select, such as Mail, Messages, or cloud storage, handles that copy under its own terms and privacy policy. PromptSpend does not receive a list of your installed apps, recipients, or completed shares.

Links to provider evidence, documentation, alerts, source code, or other resources open a system browser, or a browser view provided by the operating system. Information you submit on an external page is governed by that page's policy. PromptSpend does not silently submit it from the native app.

## Optional alerts

You may subscribe to email price alerts from the native app or website. On the website, Google Analytics also receives a hashed copy of the email address you enter, as described under Website visit statistics. The alert service stores the email address, delivery cadence, followed-model choices, confirmation status, and consent time needed to deliver the service. It also stores a keyed hash of the connection address for abuse prevention rather than the original network address. Cloudflare provides the database, bot-verification, hosting, and email-delivery infrastructure used for this service and processes the data under PromptSpend's instructions.

New subscriptions require email confirmation. Unconfirmed subscriptions are deleted after seven days. Short-lived management codes expire after 10 minutes, and an in-app management credential expires after 30 minutes. A confirmed email subscription remains until you unsubscribe; unsubscribing deletes the address, preferences, follows, and active management codes from the alert database. Alert emails use no tracking pixels or click tracking.

You can also turn on browser push notifications on the website. For that, the alert service stores the opaque subscription address your browser generates for the push service, its two encryption keys, and the models you follow, and nothing that identifies you. Unsubscribing, or the push service reporting the subscription as gone, deletes it. Native push notifications are not included in the current app release.

Alert links carry a private token in their web address. For that reason the alert service's per-request logging is switched off, and its own diagnostic messages are written to record counts, internal identifiers and error types rather than email addresses or tokens, and Cloudflare keeps them for the same limited period.

## Mobile app launch notification

Before the iPhone and Android apps were released, the website offered a separate, optional list for one announcement: an email when the apps became available to download. It was never a price-alert subscription, and joining one did not affect the other.

That list closed when the apps launched in September 2026. The website no longer accepts signups, and every address on the list has been deleted, as this policy promised. The list held no addresses from outside PromptSpend, so no announcement email was sent.

## Support and security reports

If you contact us, we receive the information you choose to send, such as your email address and message. Please do not include private prompt text, credentials, API keys, or other secrets in a support request. Support messages are used to respond, investigate problems, prevent abuse, and maintain the service.

## Sale, advertising, and disclosure

PromptSpend does not sell personal information for money. The website's Google Analytics has Google signals and ad personalization switched on, so Google may use website visits for targeted advertising, as described under Website visit statistics; under some U.S. state laws that may count as sharing personal information for targeted advertising. To stop it, choose Turn off on the notice, use the control on this page, or send Global Privacy Control from your browser, which PromptSpend treats as that opt-out. We may disclose information when required by law, to protect users or the service, or to vendors acting under instructions to operate hosting, email, security, or delivery infrastructure.

## Children

PromptSpend is a technical cost-planning tool and is not directed to children under 13. It does not knowingly create profiles for children or request age, school, or parental information.

## Security and retention

PromptSpend minimizes collection, uses HTTPS for network traffic, and keeps private prompt processing on-device. No system is perfectly secure. Local app data remains until you remove it or uninstall the app. Alert records follow the time limits described above. Google Analytics keeps visit-level data for 14 months.

The public pricing API, at promptspend.dev, has Cloudflare's request logging switched on so we can diagnose faults. It includes a hosted MCP server at promptspend.dev/mcp, which receives the model names and workload numbers an AI assistant sends it, uses them to answer, and does not store them; our code does not log them. A request log can include the address requested, the time, and connection details such as an IP address, and Cloudflare keeps these logs for up to seven days. The pricing API needs no account or key and its addresses carry no secrets. PromptSpend keeps no request logs for the website's pages, and the update server's logging is switched off; their hosts process ordinary connection information as described under Network requests.

## Changes and contact

Material changes will be posted on this page with a new review date. Questions about privacy may be sent to [info@promptspend.com](mailto:info@promptspend.com). Security reports should be sent to [security@promptspend.com](mailto:security@promptspend.com). General help is available on the [PromptSpend support page](https://promptspend.com/support/).
