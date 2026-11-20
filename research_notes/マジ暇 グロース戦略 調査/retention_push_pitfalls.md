# Retention, Push Notifications and Growth Pitfalls for Social and Planning Apps (Japan focus)

Research date: 2026-11-20. Network note: airship.com and soumu.go.jp could not be fetched directly from this session (blocked host), so some figures come from search snippets of those pages rather than full-text reads. Those are flagged below.

## Q1. Retention benchmarks for social apps (D1/D7/D30), top quartile, and habit drivers for weekly-cadence apps

### Takeaway
A typical (median) social app in 2025 data keeps about 30% of users on D1, 10–12% on D7 and 5–6% on D30. "Good" or "great" consumer social, as venture investors define it, is much higher: D1 60–70%, D7 40–50%, D30 25–30%. A weekly-cadence planning app should be judged on weekly cohorts (W1/W4/W8 retention), not daily ones. Streak, recap and social-obligation mechanics give measurable lifts in retention.

### Cited Findings
- **Median, US, Q3 2025, Social & Communication category:** D1 31.9%, D7 12.3%, D30 5.9%. The same source says social has a lower D1 than games but the highest D30 of the categories it covers. — [MWM retention glossary](https://mwm.ai/glossary/retention)
- **All-app averages, Pushwoosh Benchmarks 2025:** iOS D7 6.89% and D30 3.10%; Android D7 5.15% and D30 2.82%. — [Pushwoosh](https://pushwoosh.com/blog/increase-user-retention-rate)
- **a16z social-app tiers (March 2023):**

  | Tier | D1 | D7 | D30 |
  |---|---|---|---|
  | OK | 50% | 35% | 20% |
  | Good | 60% | 40% | 25% |
  | Great | 70% | 50% | 30% |

  These are top-performer thresholds for VC-backable social apps, not medians. — [a16z, "Do You Have Lightning in a Bottle?"](https://a16z.com/2023/03/03/how-to-benchmark-your-social-app/)
- **MWM "strong consumer social" bar:** D1 > 40%, D7 > 20%, D30 > 10%. This conflicts with MWM's own medians, so read it as an aspirational target. — [MWM](https://mwm.ai/glossary/n-day-retention)
- **Secondary aggregator:** social/messaging at D1 25–29%, D7 9–10%, D30 about 5%, attributed to Adjust and Sendbird. The underlying reports were not verified. — [Lovable guide](https://lovable.dev/guides/what-is-a-good-retention-rate-for-an-app)
- **AppsFlyer and other 2025–2026 reports:** AppsFlyer's 2025 retention benchmark report exists, but only its introduction was retrievable. A 2026 mobile retention benchmarks PDF also exists. — [AppsFlyer](https://appsflyer.com/?p=453529); [investgame PDF](https://investgame.net/wp-content/uploads/2026/01/2026-01-20-Mobile_retention_benchmarks_2026.pdf)
- **Duolingo streak A/B test:** statistically significant gains in D1, D7 and D14 retention, with the biggest lift at D7 (+14%). — [Duolingo Engineering](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)
- **Duolingo streak behavior:** learners who reach a 7-day streak are 2.4x more likely to return the next day. Decoupling the streak from the daily lesson raised D14 retention by 3.3%. — [Duolingo blog](https://blog.duolingo.com/improving-the-streak)
- **Duolingo Friend Streak:** users with at least one Friend Streak were 22% more likely to finish their daily lesson. Social, shared streaks are directly relevant to friend-planning apps. — [Duolingo blog](https://blog.duolingo.com/product-lessons-friend-streak/)
- **Streak adoption elsewhere:** Sensor Tower credits the streak with Duolingo's record 17M DAU (2023). Busuu saw a 15% rise in sessions after adding one. — [Sensor Tower](https://sensortower.com/blog/duolingo-streak-feature-app-engagement-growth)
- **Clubhouse (global):** Sensor Tower data from 2021 suggested retention among existing users stayed strong even as downloads collapsed. Download decline and retention are separate failure modes. — [9to5mac](https://9to5mac.com/2021/05/03/clubhouse-downloads-plummet-to-900000-in-april-as-competition-grows/)

### Inferences
- A planning app used roughly once a week will look terrible on D1/D7 daily-active metrics even when it is healthy. Track "% of week-0 users who created or joined a plan in week N" (W1, W4, W8) and the WAU/MAU ratio. The a16z thresholds still apply to "returned at all on day N" when push-driven returns are counted.
- A streak in a weekly app should be a weekly streak (for example "n weeks in a row you hung out or posted availability"), ideally shared between friends like Duolingo's Friend Streak, since mutual obligation is the strongest lever found.
- A periodic recap ("this month you met X friends N times"), Spotify Wrapped-style, fits a weekly cadence. It is shareable and acts as both a retention and an acquisition loop. No hard data was found on its effect (see Gaps).

### Gaps
- No Japan-specific retention benchmarks for social apps were found. Adjust and AppsFlyer Japan breakdowns are likely in gated PDFs.
- No published data on Spotify Wrapped share or retention effects, or on Partiful's or other planning apps' retention mechanics, came up in searches.
- No weekly-cohort (W1/W4) benchmarks for low-frequency social apps were found.

## Q2. Push notifications: opt-in rates (Japan vs US), frequency, timing, personalization, fatigue and uninstall triggers, weekly digests

### Takeaway
iOS opt-in is the binding constraint. Global iOS averages are around 44%, and Android 13+ now requires opt-in, so the two platforms are converging. No public Japan-specific push opt-in figure was found. Survey data shows notification fatigue sets in at just 2–5 pushes per week for non-essential messages. Apple requires explicit opt-in consent for any promotional push.

### Cited Findings
- **Average opt-in rates (vendor aggregate, undated by country):** 67.5% across all devices; Android 91.1%; iOS 43.9%. The Android figure predates or mixes pre-Android-13 default-on data. — [MobiLoud](https://www.mobiloud.com/blog/push-notification-opt-in-rate)
- **Pushwoosh 2025 range:** average opt-in varies from 23% to 92% depending on platform and other factors. — [Pushwoosh](https://cdc.pushwoosh.com/blog/increase-push-notifications-opt-in)
- **Airship 2026:** Android 13+ adoption has brought Android and iOS opt-in rates close to parity. Android's old default-on setting had inflated its metrics. Read from a search snippet; the page could not be fetched. — [Airship 2026 benchmarks](https://www.airship.com/mobile-app-push-notification-benchmarks-for-2026/); [Airship guide, Mar 2026](https://www.airship.com/blog/your-guide-to-airships-mobile-app-push-notification-benchmarks-for-2026/)
- **Airship vertical data:** Airship's 2025 report breaks out "social" (networking, messaging, dating, communication) by platform, but the values were not extractable. — [Airship 2025 PDF](https://growth.airship.com/rs/313-QPJ-195/images/Airship-2025-Push-Notification-Benchmarks-EN.pdf?version=0)
- **Japan adjacent data point:** iOS App Tracking Transparency opt-in in Japan was 20.7% in H1 2024 and rose in H1 2025 (exact figure truncated). This is tracking consent, not push consent, but it suggests Japanese iOS users are relatively consent-averse. — [Japan app trends 2025 (storyblok PDF)](https://a.storyblok.com/f/47007/x/9682af56e4/japan-app-trends-2025.pdf)
- **Japan open rates:** DearOne (an NTT Docomo affiliate) reports a roughly 3x gap in push open rates between top-tier and average apps in Japan. — [ネットショップ担当者フォーラム / PR TIMES](https://netshop.impress.co.jp/r/prtimes/items/000000387.000002473)
- **Japan timing:** Braze (Japanese article) cites a company survey where the hours when push sends were concentrated did not match the hours when purchase rates peaked, and says the best hours differ by genre. — [Braze JP](https://www.braze.com/ja/resources/articles/push-notification-open-rates)
- **Frequency fatigue (Localytics 2017, 1,000 US users):**

  | Pushes per week | Share who would disable notifications |
  |---|---|
  | 1 | 10% |
  | 2–5 | 37% (46% in another citation of the same data) |
  | 6–10 | 33% |

  The share who would stop using the app at 2–5 pushes per week fell from 31% (2015) to 22.3% (2017). — [MarketingProfs](https://www.marketingprofs.com/charts/2018/33486/how-many-mobile-push-notifications-are-too-many); [Business of Apps](https://www.businessofapps.com/marketplace/push-notifications/research/push-notifications-statistics/)
- **Uninstalls:** 1 push per week is cited as causing 10% to disable notifications and 6% to uninstall. — [Business of Apps](https://www.businessofapps.com/marketplace/push-notifications/research/push-notifications-statistics/)
- **Fatigue by age (Helplama survey):** at 2–5 pushes per week, 31% of 18–29-year-olds would disable notifications, versus 44% of 30–44 and 57% of 60+. Younger users tolerate more. — [Helplama](https://helplama.com/?p=9035)
- **Opt-out drivers:** Braze lists irrelevant or poorly timed pushes and over-frequency as the main reasons users opt out. — [Braze](https://www.braze.com/resources/articles/opt-out-of-push-notifications-why-users-do-it)
- **Apple Guideline 4.5.4:**
  - Push must not be required for the app to function.
  - Push must not carry sensitive personal or confidential information.
  - Promotional or direct-marketing push needs explicit opt-in via consent language shown in the app UI, plus an in-app way to opt out.
  - Abuse can lead to revocation of push privileges.

  — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- **Apple Guideline 4.5.3:** "Do not use Apple Services to spam, phish, or send unsolicited messages to customers, including … Push Notifications." — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

### Inferences
- **Transactional versus promotional push:**
  - Friend-triggered pushes ("X is free tonight", "Y accepted your invite") are transactional and user-valued. They don't count toward the fatigue budget the way marketing pushes do.
  - App-originated nudges ("Nobody's planned the weekend yet!") should be capped at about 1–2 per week. Above that, survey data shows 10% to 40%+ disabling.
  - Under 4.5.4, promotional nudges need a separate consent toggle.
- **Weekly digest timing (hypothesis, not tested data):** one digest at the decision point for weekend plans, such as Thursday or Friday evening for that weekend, or Sunday evening for the next week. Japan-specific send-time data was not found, so A/B test this.
- **Opt-in prompt:** ask for push permission in context, for example right after the user sends their first invite ("Get notified when Taro replies?"), not at first launch. Japan's low ATT consent suggests a cold prompt will underperform.
- **Personalization:** friend-level content (names, specific times) is the natural form of personalization for this app type. Generic copy is what users report as irrelevant and leads them to opt out.

### Gaps
- No public Japan push opt-in rate (iOS or Android) was found. Airship, Repro, KARTE and DearOne hold this in gated reports.
- No reliable data on best send times in Japan for social or planning apps was found.
- No hard numbers on personalization uplift were retrieved. Vendor claims exist but were not verified.
- Most frequency and fatigue surveys are 2014–2017 US data. No 2022–2026 Japan equivalent was found.

## Q3. Failure cases and pitfalls: contact spam, App Store violations, Japanese legal risks, backlash and hype decay. Includes a "must NOT do" list.

### Takeaway
The biggest growth-hack risks for a small developer in Japan are:
- **Contact handling:** uploading or auto-messaging contacts. Path and LinkedIn are the precedents, Apple 5.1.2(iv)/(v) prohibits it, and 個人情報保護法 is in play.
- **Incentivized reviews or posts:** these breach Apple's Section 3 preamble and 3.2.2(x), and are ステマ under 景品表示法. Japan's first enforcement action (June 2024) was literally "discount for a 4–5 star review".
- **Invite messages:** sending invites that could be read as advertising without the recipient's opt-in risks 特定電子メール法.
- **UGC safeguards:** shipping without the moderation and blocking features Guideline 1.2 requires.

Hype apps (Clubhouse, BeReal, Gas) decayed because novelty or scarcity drove downloads without a durable recurring use case, and competitors cloned the core feature.

### Cited Findings

**US contact-spam precedents**
- **Path (Feb 2013, FTC):** the FTC said Path automatically collected and stored users' address books (names, addresses, phones, emails, birthdays) even when users had not chosen "find friends from your contacts".
  - Path paid an $800,000 civil penalty, which was for COPPA violations covering about 3,000 under-13 users.
  - It also had to set up a privacy program with independent assessments for 20 years.
  - The CEO publicly apologized and the data was deleted.

  — [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2013/02/path-social-networking-app-settles-ftc-charges-it-deceived-consumers-improperly-collected-personal); [DOJ](https://www.justice.gov/opa/pr/social-networking-company-pay-800000-collecting-personal-information-minors)
- **LinkedIn "Add Connections" (Perkins v. LinkedIn, settled 2015 for $13M):** the court found users consented to importing contacts and to the first invite. It did not find consent for the two automatic reminder emails sent in the user's name and with their photo. LinkedIn added a disclosure that two reminders will be sent. — [Fortune](https://fortune.com/2015/10/05/linkedin-class-action/); [Justia court docs](https://docs.justia.com/cases/federal/district-courts/california/candce/5:2013cv04303/270092/106/1.html)

**Apple App Review Guidelines (current text fetched 2026-11-20)**
- **5.1.2(v):** "Do not contact people using information collected via a user's Contacts or Photos, except at the explicit initiative of that user on an individualized basis; do not include a Select All option or default the selection of all contacts. You must provide the user with a clear description of how the message will appear to the recipient before sending it."
- **5.1.2(iv):** do not use Contacts data "to build a contact database for your own use or for sale/distribution to third parties."
- **5.1.1(iii):** "Where possible, use the out-of-process picker or a share sheet rather than requesting full access to … Contacts."
- **5.1.1(iv):** apps must not "manipulate, trick, or force people to consent to unnecessary data access."
- **Section 3 preamble:** manipulating reviews or charts "with paid, incentivized, filtered, or fake feedback" may lead to expulsion from the Developer Program.
- **3.2.2(x):** apps must not force users to rate, review or download other apps to access functionality.
- **Custom review prompts:** since 2020, Apple disallows custom review prompts. Use the system API (Guideline 5.6.1). — [MacRumors 2020](https://www.macrumors.com/2020/03/04/apple-shares-updated-app-store-guidelines/)
- **1.2 User-Generated Content:** social apps must include:
  - a filter for objectionable material
  - a way to report content, with timely responses
  - the ability to block abusive users
  - published contact information
- **1.2.1(a):** creator apps need an age-restriction mechanism.
- **5.1.4:** extra limits on collecting data from kids.
- **1.1.6:** apps enabling anonymous or prank SMS/MMS are rejected.

Source for the Apple guideline text above (fetched 2026-11-20): [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

**Japan: 景品表示法 ステマ規制**
- **The rule:** the stealth-marketing designation took effect 1 October 2023. The advertiser who requested the post is liable, not the poster.
- **First enforcement (June 2024):** 消費者庁 issued a 措置命令 against 医療法人社団祐真会, a Tokyo clinic that offered patients a discount in exchange for posting 4- or 5-star Google Maps reviews.
- **SNS-post case:** a company that gave free products to recruited third parties and requested SNS posts (高光製薬, "ノビルンC") also received a 措置命令.
- **Unpublished guidance:** experts estimate administrative guidance (not published) runs at 2–3x the number of formal actions.

  — [ネットショップ担当者フォーラム](https://netshop.impress.co.jp/node/12404); [FASHIONSNAP](https://www.fashionsnap.com/article/2024-06-19/stealth-marketing/); [モノリス法律事務所](https://monolith.law/corporate/stealth-marketing-regulation-risks)
- **TikTok Japan case (Jan 2022, before the regulation):** TikTok Japan admitted paying about 20 Twitter influencers over roughly 2.5 years to spread videos without PR labels. Staff posed as agency employees under false names. It apologized and published an investigation report on 10 Feb 2022. This is a reputational 炎上 case, and under current rules it would be ステマ. — [iPhone Mania](https://iphone-mania.jp/news-434908); [AdverTimes](https://www.advertimes.com/20220201/article375620/)

**Japan: 特定電子メール法**
- **Scope:** covers emails sent by for-profit entities, or individuals in business, as a means of advertising their own or another's business.
- **Opt-in since 2008:** sending is allowed only to recipients who consented in advance, with limited exceptions.
- **Display duties (Art. 4):** the sender name and an opt-out address must be shown.
- **Penalties:** the corporate fine cap was raised to ¥30,000,000 in the 2008 amendment, in force 1 Dec 2008.
- **Who is the sender:** per the 総務省・消費者庁 guideline, a party that directs recipients or content counts as a 送信委託者. Whether a referral-invite email designed by the operator counts as the operator's 特定電子メール is decided case by case.

  — [総務省](https://www.soumu.go.jp/main_sosiki/cybersecurity/kokumin/basic/legal/08/); [総務省 pamphlet](https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/pdf/m_mail_pamphlet.pdf); [Square解説](https://squareup.com/jp/ja/townsquare/specified-electronic-mail) (search snippets; soumu.go.jp could not be fetched)

**Japan: 個人情報保護法**
- **Consent rule:** providing personal data to a third party requires the person's prior consent in principle (Art. 27), unless the opt-out route is notified to the PPC. Recipients have confirmation and record-keeping duties (Art. 30).
- **2026 amendments:** PPC materials dated October 2026 show amendment work under way, including stronger opt-out rules and the introduction of 課徴金 (administrative fines).

  — [PPC 第三者提供ガイドライン](https://www.ppc.go.jp/personalinfo/legal/guidelines_thirdparty/); [PPC 2026 materials](https://www.ppc.go.jp/files/pdf/261014_shiryou-1.pdf)

**Hype-app decay cases**
- **Clubhouse:**
  - Downloads peaked at about 9.6M in February 2021, fell to 2.7M in March and to 922k in April 2021 (-66% month on month).
  - Contributing factors: Twitter Spaces launched; invite-only scarcity was exhausted; there was no Android app until May 2021; the COVID-lockdown demand that fueled it faded.
  - By June 2022, downloads were down 95% year on year (332k).

  — [9to5mac](https://9to5mac.com/2021/05/03/clubhouse-downloads-plummet-to-900000-in-april-as-competition-grows/); [Business Insider Japan](https://www.businessinsider.jp/post-233504); [Appfigures](https://appfigures.com/resources/insights/20220701/amp?f=4)
- **Gas:**
  - It hit 1M DAU within two months and topped the US App Store in Oct–Nov 2022. Discord acquired it in January 2023.
  - Growth stalled quickly: about 5% of users deleted it in the second week of October. A false rumor (about trafficking) caused a two-week download plateau and a reported 3% uninstall in a single day.
  - Discord shut it down on 7 Nov 2023, citing a steep decline in users.

  — [Wikipedia: Gas (app)](https://www.wikipedia.org/wiki/Gas_(app)); [TechCrunch](https://techcrunch.com/2023/10/19/discord-kills-gas-anonymous-compliments-app-bought-nine-months-ago); [Appfigures](https://appfigures.com/resources/insights/20230721/5-out-of-gas-was-discords-acquisition-all-snake-oil)
- **BeReal:** it reportedly had about 20M daily users in 2022 and faced reports of losing steam. In September 2023 it countered by claiming 25M DAU (company-reported). TechCrunch notes it had previously been said to struggle with retention. — [TechCrunch](https://techcrunch.com/2023/09/29/bereal-pushes-back-at-report-that-its-losing-steam-says-it-now-has-25m-daily-users/)

### Inferences: concrete "must NOT do" list for a small developer growing a social or planning app in Japan

1. **Do not upload the whole address book or request full Contacts access as a growth hack.** Use the system contact picker or the share sheet (LINE, iMessage) for individual invites.
   - Basis: Apple 5.1.1(iii)/(iv) and 5.1.2(iv); the Path precedent.
   - Uploading third parties' phone numbers also raises 個人情報保護法 Art. 27 third-party provision questions.
2. **Do not auto-send invites, use "Select All", pre-select contacts, or send automatic follow-up reminders in the user's name.** Show the exact message preview and the apparent sender before sending.
   - Basis: Apple 5.1.2(v); the LinkedIn $13M settlement.
3. **Do not have the server send invite emails or SMS with promotional content to non-users who have not opted in.** If invites go by email from the operator's domain with promotional content, treat them as 特定電子メール: get consent, show sender details and an opt-out (Art. 4). Fines run up to ¥30M for corporations.
   - Safer pattern: the user sends a personal share link from their own LINE or messaging app.
4. **Do not offer rewards (coins, premium days, raffle entries) in exchange for App Store reviews, star ratings or SNS posts about the app without a clear PR label.**
   - Basis: Apple Section 3 and 3.2.2(x), with a risk of Developer Program expulsion.
   - Basis: 景品表示法 ステマ告示 (Oct 2023); the June 2024 祐真会 case was a discount for reviews.
   - Use only the system review prompt (SKStoreReviewController).
5. **Do not pay influencers or friends to post without "PR" or "広告" disclosure.** This is the TikTok Japan 2022 炎上 pattern and is now illegal ステマ.
6. **Do not ship social features without the UGC safeguards required by Guideline 1.2:** report, block, objectionable-content filtering, and published contact info. Add age gating and restraint toward under-18s (Apple 1.2.1, 1.3, 5.1.4; US COPPA if minors are reached, which is where Path's $800k came from).
7. **Do not send promotional or re-engagement push without separate opt-in consent and an in-app opt-out (Apple 4.5.4).** Do not make push mandatory, and never put sensitive content in push.
8. **Do not rely on scarcity or novelty alone, like the invite-only Clubhouse and anonymous-compliment Gas hype loops.** Durable retention needs a recurring real-world job, such as "who's free this week".
9. **Do not build anonymous-messaging or prank features (Apple 1.1.6), and be cautious with anonymous mechanics among teens.** The Gas rumor collapse shows how fast trust shocks spread.

### Gaps
- No Tango contact-spam lawsuit details were found in the searches. Do not cite it without verification.
- No 総務省 Q&A text specifically addressing friend-referral or invite emails was retrievable, so how invite emails are classified remains a legal judgment call. Consult a lawyer or the 総務省 ガイドライン directly.
- No PPC guidance specifically on mobile address-book uploads was found.
- Apple guideline 5.6.x text beyond 5.2.5 was cut off in the fetch. The 5.6.1 custom-review-prompt ban is cited from 2020 MacRumors coverage, and the review-manipulation ban from the Section 3 preamble and the Introduction.
- No Japan-specific app 炎上 cases beyond TikTok's ステマ were found (for example, privacy backlash against Japanese social apps).
- No Japan-specific Clubhouse decline metrics were found; the figures above are global.
