# Gather: making a content bouquet.
*Gather ye rosebuds while ye may,
Old Time is still a-flying;
And this same flower that smiles today
To-morrow will be dying. - [Robert Herrick](https://en.wikipedia.org/wiki/To_the_Virgins,_to_Make_Much_of_Time)*

## Overview
This utility takes a CSV that is formatted like an XML sitemap, crawls the URLs, and outputs a parsed CSV that has the content prepped for CMS import.

Gather was born from the need to create content that could be imported to a CMS as part of a web redesign. There was no way to get the content except by scraping the site.

Using a sitemap generator, we were able to get a list of URLs to crawl, parse, and port to a format we could then use with a pre-built CMS importer.

## Requirements
Node and NPM. That's it.

## Installation & Setup
Clone this repository.
Then do the following (assuming you cloned to the directory `gather`):
```
$ cd gather
$ npm install
```

## Getting Ready
You need two files to run this script: a source CSV with a column named `URL` at minimum, and a configured YAML file. Take a look at `sample.yml` in the repository for an example.

All paths in the YAML file are relative to the location of the main `gather.js` script.

## Ready... set... go!
Run `node gather`, give it the path to your YAML file, and watch the magic happen.

The script will output a `[post-type]-content.csv` file in the script directory if it runs successfully.
