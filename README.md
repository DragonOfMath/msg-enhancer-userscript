# msg-enhancer-userscript
Adds voting, faving, and downloading to the index pages of [e621.net](https://e621.net) and [e926.net](https://e926.net) (SFW mirror)

# Installation
1. Have a userscript manager such as Greasemonkey (Firefox) or Tampermonkey (Chrome)
2. View `msg-enhancer.user.js` and click the Raw link button. Your userscript should automatically install it from there.

# Usage
Once you have installed the script, login to e621.net or e926.net and browse or search. You should immediately notice changes to the layout, including the addition of up/down arrows, a heart, and a download icon under each item, plus a new section in the sidebar.

Due to the nature of index pages, there is no simple way to find out if a post is faved or voted on by you, so I have diligently worked around this by using a cache system that integrates with the front-end code. Due to this pitfall, votes and favorites will not appear updated until you click them or visit the content's page. Luckily, if you have already voted or faved something, it will correct itself if you vote or fave it again.

In the sidebar, you should notice six components:
* **Sync** allows you to quickly fetch all your favorites and cache them with MSG Enhancer. It is recommended you do this first to save yourself a lot of updating.
* **Save** lets you a backup of the cache on local disk, which is in JSON format.
* **Load** will read a JSON cache file you choose.
* **Clear** will purge all your cached votes and favorites. You can't undo this unless you load a previously saved cache file.
* **Hide downvoted** will hide posts that you've downvoted.
* **Hide upvoted** will hide posts that you've upvoted.

# Notes
* Because of the way userscripts work, do not use the back button in your browser.
* The notice bar on content pages will auto-scroll the window after voting or faving. You'll just have to get used to it because I can't modify the front-end.
* I recommend using the Bloodlust theme to make the arrows slightly more visible. Other themes are too bright or use a font that makes the arrows harder to click.
* Settings for hiding posts are not saved with the userscript data. For convenience, downvoted posts are always hidden, and upvoted posts are always shown when you load a page.
