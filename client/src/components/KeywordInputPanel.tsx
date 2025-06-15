import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lightbulb, Wand2, Edit, CheckCircle, RefreshCw, ChevronDown, ChevronUp, FileText } from "lucide-react";
import type { Topic } from "@/lib/api";
import type { Blog } from "@shared/schema";

export type ArticleLength = 'short' | 'medium' | 'long' | 'extra-long';

export interface ArticleLengthConfig {
  words: string;
  images: number;
  description: string;
}

export const ARTICLE_LENGTH_OPTIONS: Record<ArticleLength, ArticleLengthConfig> = {
  'short': {
    words: '300-400',
    images: 1,
    description: 'Quick read with 1 image'
  },
  'medium': {
    words: '500-700', 
    images: 2,
    description: 'Standard article with 2 images'
  },
  'long': {
    words: '1400-1700',
    images: 4,
    description: 'In-depth article with 4 images'
  },
  'extra-long': {
    words: '2500-3000',
    images: 6,
    description: 'Comprehensive guide with 6 images'
  }
};

interface KeywordInputPanelProps {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  topics: Topic[];
  selectedTopic: Topic | null;
  blogs: Blog[];
  onGenerateTopics: () => void;
  onTopicSelect: (topic: Topic) => void;
  isGeneratingTopics: boolean;
  onGenerateFromCustomTopic?: (customTopic: string, articleLength?: ArticleLength) => void;
  onBlogSelect?: (blog: Blog) => void;
  articleLength?: ArticleLength;
  onArticleLengthChange?: (length: ArticleLength) => void;
}

export default function KeywordInputPanel({
  keyword,
  onKeywordChange,
  topics,
  selectedTopic,
  blogs,
  onGenerateTopics,
  onTopicSelect,
  isGeneratingTopics,
  onGenerateFromCustomTopic,
  onBlogSelect,
  articleLength = 'long',
  onArticleLengthChange,
}: KeywordInputPanelProps) {
  const [customTopic, setCustomTopic] = useState("");
  const [showAllBlogs, setShowAllBlogs] = useState(false);

  const handleCustomTopicGenerate = () => {
    if (customTopic.trim() && onGenerateFromCustomTopic) {
      onGenerateFromCustomTopic(customTopic.trim(), articleLength);
    }
  };
  return (
    <div className="lg:col-span-1">

      <Card className="sticky top-24">
        <CardHeader>
          <CardTitle>Start Your Blog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Keyword Input */}
          <div>
            <Label htmlFor="keyword">Seed Keyword</Label>
            <Input
              id="keyword"
              placeholder="e.g., sustainable fashion"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              className="mt-2"
            />
          </div>

          {/* Article Length Selector */}
          <div>
            <Label htmlFor="articleLength" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Article Length
            </Label>
            <Select value={articleLength} onValueChange={onArticleLengthChange}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select article length" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">
                  <div className="flex flex-col">
                    <span className="font-medium">Short ({ARTICLE_LENGTH_OPTIONS.short.words} words)</span>
                    <span className="text-sm text-muted-foreground">{ARTICLE_LENGTH_OPTIONS.short.description}</span>
                  </div>
                </SelectItem>
                <SelectItem value="medium">
                  <div className="flex flex-col">
                    <span className="font-medium">Medium ({ARTICLE_LENGTH_OPTIONS.medium.words} words)</span>
                    <span className="text-sm text-muted-foreground">{ARTICLE_LENGTH_OPTIONS.medium.description}</span>
                  </div>
                </SelectItem>
                <SelectItem value="long">
                  <div className="flex flex-col">
                    <span className="font-medium">Long ({ARTICLE_LENGTH_OPTIONS.long.words} words)</span>
                    <span className="text-sm text-muted-foreground">{ARTICLE_LENGTH_OPTIONS.long.description}</span>
                  </div>
                </SelectItem>
                <SelectItem value="extra-long">
                  <div className="flex flex-col">
                    <span className="font-medium">Extra Long ({ARTICLE_LENGTH_OPTIONS['extra-long'].words} words)</span>
                    <span className="text-sm text-muted-foreground">{ARTICLE_LENGTH_OPTIONS['extra-long'].description}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => {
              console.log('Generate Topics clicked with keyword:', keyword);
              onGenerateTopics();
            }}
            disabled={!keyword.trim() || isGeneratingTopics}
            className="w-full"
            onMouseDown={() => {
              console.log('Generate Topics mousedown');
              onGenerateTopics();
            }}
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            {isGeneratingTopics ? "Generating..." : "Generate Topics"}
          </Button>

          {/* Custom Topic Input */}
          <div className="border-t border-gray-200 pt-4">
            <Label htmlFor="customTopic">Or Write Your Own Topic</Label>
            <Textarea
              id="customTopic"
              placeholder="e.g., How to Build a Profitable Dropshipping Business in 2025"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              className="mt-2"
              rows={3}
            />
            <Button
              onClick={handleCustomTopicGenerate}
              disabled={!customTopic.trim() || isGeneratingTopics}
              className="w-full mt-2"
              variant="outline"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Blog from Custom Topic
            </Button>
          </div>

          {/* Generated Topics */}
          {topics.length > 0 && (
            <div className="border-l-4 border-green-500 bg-green-50 p-3 mt-4">
              <h4 className="font-medium text-green-800">Auto-Generated Topics</h4>
              <p className="text-sm text-green-700">
                Found {topics.length} topics. First topic selected automatically for content generation.
              </p>
              <p className="text-xs text-green-600 mt-1">
                Selected: "{selectedTopic?.title}"
              </p>
            </div>
          )}
          {topics.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Generated Topics ({topics.length} found)</h3>
                <Button
                  onClick={onGenerateTopics}
                  disabled={isGeneratingTopics}
                  variant="ghost"
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refresh
                </Button>
              </div>


              <div className="space-y-2">
                {topics.map((topic, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Topic card clicked:', topic);
                      onTopicSelect(topic);
                    }}
                    className={`w-full text-left p-3 rounded-lg cursor-pointer transition-all border-l-4 ${
                      selectedTopic?.title === topic.title
                        ? "bg-blue-50 border-blue-500 ring-2 ring-blue-200"
                        : "bg-gray-50 border-transparent hover:bg-gray-100 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{topic.title}</p>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{topic.description}</p>
                      </div>
                      {selectedTopic?.title === topic.title && (
                        <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 ml-2" />
                      )}
                    </div>
                    <div className="flex items-center space-x-2 mt-2">
                      <Badge 
                        variant={topic.competition === "Low" ? "default" : topic.competition === "Medium" ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {topic.competition} competition
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {topic.intent}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>


            </div>
          )}

          {/* Blog History */}
          {blogs.length > 0 && (
            <div className="pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Recent Blogs</h3>
                {blogs.length > 3 && (
                  <button
                    onClick={() => setShowAllBlogs(!showAllBlogs)}
                    className="flex items-center text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showAllBlogs ? (
                      <>
                        Show Less <ChevronUp className="w-3 h-3 ml-1" />
                      </>
                    ) : (
                      <>
                        Show All ({blogs.length}) <ChevronDown className="w-3 h-3 ml-1" />
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {(showAllBlogs ? blogs : blogs.slice(0, 3)).map((blog) => (
                  <div
                    key={blog.id}
                    onClick={() => onBlogSelect?.(blog)}
                    className="flex items-center justify-between p-2 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-lg transition-all cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{blog.title}</p>
                      <p className="text-xs text-gray-500">
                        {blog.status === "published" ? "Published" : "Draft"} • {" "}
                        {new Date(blog.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge 
                      variant={blog.status === "published" ? "default" : "secondary"}
                      className="ml-2"
                    >
                      {blog.status === "published" ? (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Published
                        </>
                      ) : (
                        <>
                          <Edit className="w-3 h-3 mr-1" />
                          Draft
                        </>
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
